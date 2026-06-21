const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
  mediaUpload,
  ensureVideoDuration,
} = require("../middleware/cloudinaryUpload");
const User = require("../models/userCreate");
const Status = require("../models/status");
const FollowRequest = require("../models/followRequest");
const HiddenStatusUser = require("../models/hiddenStatusUser");

const STATUS_LIFETIME_MS = 24 * 60 * 60 * 1000;

const cloudinary = require("cloudinary").v2;

router.post("/upload", auth, mediaUpload.single("image"), async (req, res) => {
  try {
    const { caption = "", backgroundSong: backgroundSongRaw = null } = req.body;

    let backgroundSong = null;
    if (backgroundSongRaw) {
      try {
        backgroundSong = JSON.parse(backgroundSongRaw);
      } catch {
        backgroundSong = null;
      }
    }

    await ensureVideoDuration(req.file, 60);

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "Image or video is required" });
    }

    const user = await User.findOne({ userId: req.user.id });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const existingStatus = await Status.findOne({ userId: user._id });
    if (existingStatus?.imagePublicId) {
      try {
        await cloudinary.uploader.destroy(existingStatus.imagePublicId);
      } catch (e) {
        console.warn("Cloudinary delete failed (old status):", e.message);
      }
    }

    await Status.deleteMany({ userId: user._id });
    const status = await Status.create({
      userId: user._id,
      image: req.file.path,
      imagePublicId: req.file.filename,
      caption,
      backgroundSong,
    });

    return res
      .status(201)
      .json({ success: true, message: "Story uploaded successfully", status });
  } catch (err) {
    if (err?.statusCode) {
      return res
        .status(err.statusCode)
        .json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: "Server error" });
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
        message: "Story not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Story fetched successfully",
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

    // Build the set of userIds this viewer has chosen to hide.
    const hiddenEntries = await HiddenStatusUser.find({
      user: user._id,
      hiddenUser: { $in: friendIds },
    }).lean();
    const hiddenUserIdSet = new Set(
      hiddenEntries.map((entry) => entry.hiddenUser.toString()),
    );

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
        _id: status._id,
        image: status.image,
        caption: status.caption,
        createdAt: status.createdAt,
        updatedAt: status.updatedAt,
        user: status.userId,
        seenBy: status.seenBy || [],
      });
    });

    const visibleStatuses = [];
    const hiddenStatuses = [];

    friendRequests.forEach((request) => {
      const friend = request.from;
      if (!friend) return;

      const latestStatus = statusByUserId.get(friend._id.toString());
      if (!latestStatus) return;

      const entry = {
        user: friend,
        status: latestStatus,
      };

      if (hiddenUserIdSet.has(friend._id.toString())) {
        hiddenStatuses.push(entry);
      } else {
        visibleStatuses.push(entry);
      }
    });

    res.status(200).json({
      success: true,
      message: "Friend story fetched successfully",
      count: visibleStatuses.length,
      statuses: visibleStatuses,
      hiddenCount: hiddenStatuses.length,
      hiddenStatuses,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

//for userinfo
router.get("/user/feed/:userId", auth, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const latestStatuses = await Status.find({
      userId: user._id,
      createdAt: {
        $gte: new Date(Date.now() - STATUS_LIFETIME_MS),
      },
    })
      .sort({ createdAt: -1 })
      .populate("userId", "userName profileImage isOnline lastSeen")
      .lean();

    return res.status(200).json({
      success: true,
      statuses: latestStatuses,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
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
        .json({ success: false, message: "Story not found" });
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

router.post("/hide/:userId", auth, async (req, res) => {
  try {
    const { userId: hiddenUserId } = req.params;

    const user = await User.findOne({ userId: req.user.id });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (hiddenUserId === user._id.toString()) {
      return res
        .status(400)
        .json({ success: false, message: "You can't hide your own story" });
    }

    await HiddenStatusUser.findOneAndUpdate(
      { user: user._id, hiddenUser: hiddenUserId },
      { user: user._id, hiddenUser: hiddenUserId },
      { upsert: true, new: true },
    );

    res.status(200).json({
      success: true,
      message: "Story hidden",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

router.post("/unhide/:userId", auth, async (req, res) => {
  try {
    const { userId: hiddenUserId } = req.params;

    const user = await User.findOne({ userId: req.user.id });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    await HiddenStatusUser.deleteOne({
      user: user._id,
      hiddenUser: hiddenUserId,
    });

    res.status(200).json({
      success: true,
      message: "Story unhidden",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

router.delete("/delete", auth, async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.user.id });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const status = await Status.findOne({ userId: user._id });
    if (!status) {
      return res.status(404).json({
        success: false,
        message: "No status found",
      });
    }

    const publicId = status.imagePublicId;

    if (publicId) {
      try {
        await cloudinary.uploader.destroy(publicId);
      } catch (err) {
        console.warn("Cloudinary delete failed:", err.message);
      }
    }

    await Status.deleteOne({ _id: status._id });

    return res.status(200).json({
      success: true,
      message: "Story deleted successfully",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

module.exports = router;
