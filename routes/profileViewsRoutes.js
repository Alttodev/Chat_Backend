const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const User = require("../models/userCreate");
const ProfileView = require("../models/profileView"); 

// Get all users who viewed my profile
router.get("/seens", auth, async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.user.id });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const profileViews = await ProfileView.find({
      viewedUser: user._id,
    })
      .sort({ viewedAt: -1 })
      .populate("viewer", "userName profileImage isOnline isVerified lastSeen")
      .lean();

    const viewers = profileViews.map((view) => ({
      id: view._id,
      viewer: view.viewer,
      viewedAt: view.viewedAt,
    }));

    res.status(200).json({
      success: true,
      message: "Profile views fetched successfully",
      count: viewers.length,
      viewers,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// Mark profile as viewed
router.post("/seen/:profileId", auth, async (req, res) => {
  try {
    const viewerUser = await User.findOne({ userId: req.user.id });
    if (!viewerUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const viewedUser = await User.findById(req.params.profileId);
    if (!viewedUser) {
      return res.status(404).json({
        success: false,
        message: "Profile user not found",
      });
    }

    if (viewerUser._id.toString() === viewedUser._id.toString()) {
      return res.status(200).json({
        success: true,
        message: "Own profile view ignored",
      });
    }

    await ProfileView.findOneAndUpdate(
      {
        viewer: viewerUser._id,
        viewedUser: viewedUser._id,
      },
      {
        viewer: viewerUser._id,
        viewedUser: viewedUser._id,
        viewedAt: new Date(),
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    );

    res.status(200).json({
      success: true,
      message: "Profile marked as viewed",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

module.exports = router;
