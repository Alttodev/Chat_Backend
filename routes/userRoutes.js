const express = require("express");
const router = express.Router();
const UserProfile = require("../models/userCreate");
const auth = require("../middleware/auth");
const upload = require("../middleware/cloudinaryUpload");

// profile create

router.post(
  "/create",
  auth,
  upload.single("profileImage"),
  async (req, res) => {
    const { userName, email, address } = req.body;

    try {
      const userId = req.user.id;
      const existingProfile = await UserProfile.findOne({ userId });
      if (existingProfile) {
        return res.status(400).json({ message: "Profile already exists" });
      }

      const profileImage = req.file ? req.file.path : null;
      const profile = new UserProfile({
        userId,
        userName,
        email,
        address,
        profileImage,
      });
      await profile.save();

      res.status(201).json({
        success: true,
        message: "Profile created successfully",
        profile,
      });
    } catch (e) {
      res.status(500).json({ message: "Server Error" });
    }
  },
);

// Update profile
router.put("/update", auth, upload.single("profileImage"), async (req, res) => {
  const { userName, email, address } = req.body;

  try {
    const userId = req.user.id;
    const profile = await UserProfile.findOne({ userId });

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    profile.userName = userName;
    profile.email = email;
    profile.address = address;
    if (req.file) {
      profile.profileImage = req.file.path;
    }

    await profile.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      profile,
    });
  } catch (e) {
    res.status(500).json({ message: "Server Error" });
  }
});

//profile get

router.get("/me", auth, async (req, res) => {
  try {
    const profile = await UserProfile.findOne({ userId: req.user.id });

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    res.status(200).json({
      message: "Profile verified successfully",
      profile: {
        profileImage: profile.profileImage,
        userName: profile.userName,
        email: profile.email,
        address: profile.address,
        memberSince: profile.createdAt,
        lastUpdated: profile.updatedAt,
        id: profile._id,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
});

// all profiles get
router.get("/userProfiles", auth, async (req, res) => {
  try {
    const profiles = await UserProfile.find({ userId: { $ne: req.user.id } });

    if (!profiles || profiles.length === 0) {
      return res.status(404).json({ message: "No profiles found" });
    }

    const formattedProfiles = profiles.map((profile) => ({
      userName: profile.userName,
      isOnline: profile.isOnline,
      email: profile.email,
      address: profile.address,
      profileImage: profile.profileImage,
      memberSince: profile.createdAt,
      lastUpdated: profile.updatedAt,
      id: profile._id,
    }));

    res.status(200).json({
      success: true,
      message: "Users listed successfully",
      profiles: formattedProfiles,
    });
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
});

//including me all profiles get
router.get("/allprofiles", auth, async (req, res) => {
  try {
    const profiles = await UserProfile.find();

    if (!profiles || profiles.length === 0) {
      return res.status(404).json({ message: "No profiles found" });
    }
    const formattedProfiles = profiles.map((profile) => ({
      userName: profile.userName,
      isOnline: profile.isOnline,
      email: profile.email,
      address: profile.address,
      profileImage: profile.profileImage,
      memberSince: profile.createdAt,
      lastUpdated: profile.updatedAt,
      id: profile._id,
    }));
    res.status(200).json({
      success: true,
      message: "Users listed successfully",
      profiles: formattedProfiles,
    });
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
});
// search user
router.get("/search", auth, async (req, res) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({ message: "Search query is required" });
    }

    const profiles = await UserProfile.find({
      userId: { $ne: req.user.id },
      userName: { $regex: query, $options: "i" },
    });

    if (!profiles || profiles.length === 0) {
      return res.status(404).json({ message: "No users found" });
    }

    const formattedProfiles = profiles.map((profile) => ({
      userName: profile.userName,
      isOnline: profile.isOnline,
      email: profile.email,
      address: profile.address,
      profileImage: profile.profileImage,
      memberSince: profile.createdAt,
      lastUpdated: profile.updatedAt,
      id: profile._id,
    }));

    res.status(200).json({
      success: true,
      message: "Users found successfully",
      profiles: formattedProfiles,
    });
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
});

// Get notification settings
router.get("/notification-settings", auth, async (req, res) => {
  try {
    const profile = await UserProfile.findOne({ userId: req.user.id });

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    res.status(200).json({
      success: true,
      message: "Notification settings fetched successfully",
      settings: profile.pushNotification || {
        enabled: true,
        sound: true,
        vibration: true,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
});

// Update notification settings
router.put("/notification-settings", auth, async (req, res) => {
  const { enabled, sound, vibration } = req.body;

  try {
    const profile = await UserProfile.findOne({ userId: req.user.id });

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    // Update only provided fields
    if (enabled !== undefined) {
      profile.pushNotification.enabled = enabled;
    }
    if (sound !== undefined) {
      profile.pushNotification.sound = sound;
    }
    if (vibration !== undefined) {
      profile.pushNotification.vibration = vibration;
    }

    await profile.save();

    res.status(200).json({
      success: true,
      message: "Notification settings updated successfully",
      settings: profile.pushNotification,
    });
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
});

module.exports = router;
