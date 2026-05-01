const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const upload = require("../middleware/cloudinaryUpload");
const User = require("../models/userCreate");
const Status = require("../models/status");
const FollowRequest = require("../models/followRequest");

const STATUS_LIFETIME_MS = 24 * 60 * 60 * 1000;

router.post("/upload", auth, upload.single("image"), async (req, res) => {
  try {
    const { caption = "" } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Image is required",
      });
    }

    const user = await User.findOne({ userId: req.user.id });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    await Status.deleteMany({ userId: user._id });

    const status = await Status.create({
      userId: user._id,
      image: req.file.path,
      caption,
    });

    res.status(201).json({
      success: true,
      message: "Status uploaded successfully",
      status,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.user.id });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const status = await Status.findOne({ userId: user._id })
      .sort({ createdAt: -1 })
      .populate({
        path: "seenBy.user",
        select: "userName profileImage",
      });

    if (
      !status ||
      Date.now() - new Date(status.createdAt).getTime() > STATUS_LIFETIME_MS
    ) {
      return res.status(404).json({
        success: false,
        message: "Status not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Status fetched successfully",
      status,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

router.get("/feed", auth, async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.user.id });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const friendRequests = await FollowRequest.find({
      to: user._id,
      status: "accepted",
      isFriends: true,
      isDeleted: true,
    })
      .populate("from", "userName profileImage isOnline lastSeen")
      .lean();

    const friendIds = friendRequests
      .map((request) => request.from?._id)
      .filter(Boolean)
      .map((id) => id.toString());

    const latestStatuses = await Status.find({
      userId: { $in: friendIds },
      createdAt: { $gte: new Date(Date.now() - STATUS_LIFETIME_MS) },
    })
      .sort({ createdAt: -1 })
      .populate("userId", "userName profileImage isOnline lastSeen")
      .lean();

    const statusByUserId = new Map();
    latestStatuses.forEach((status) => {
      const key = status.userId?._id?.toString();
      if (!key || statusByUserId.has(key)) return;
      statusByUserId.set(key, {
        id: status._id,
        image: status.image,
        caption: status.caption,
        createdAt: status.createdAt,
        updatedAt: status.updatedAt,
        user: status.userId,
        seenBy: status.seenBy || [],
      });
    });

    const statuses = friendRequests
      .map((request) => {
        const friend = request.from;
        if (!friend) return null;

        const latestStatus = statusByUserId.get(friend._id.toString());
        if (!latestStatus) return null;

        return {
          user: friend,
          status: latestStatus,
        };
      })
      .filter(Boolean);

    res.status(200).json({
      success: true,
      message: "Friend statuses fetched successfully",
      count: statuses.length,
      statuses,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});
router.post("/seen/:statusId", auth, async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.user.id });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const status = await Status.findById(req.params.statusId);
    if (!status) {
      return res
        .status(404)
        .json({ success: false, message: "Status not found" });
    }

    if (status.userId.toString() === user._id.toString()) {
      return res.status(200).json({ success: true });
    }

    const alreadySeen = status.seenBy.find(
      (entry) => entry.user.toString() === user._id.toString(),
    );

    if (!alreadySeen) {
      status.seenBy.push({
        user: user._id,
        seenAt: new Date(),
      });

      await status.save();
    }

    res.status(200).json({
      success: true,
      message: "Marked as seen",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

module.exports = router;
