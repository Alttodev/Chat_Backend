const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const UserProfile = require("../models/userCreate");
const Subscription = require("../models/subscription");
const Post = require("../models/postCreate");
const auth = require("../middleware/auth");
const upload = require("../middleware/cloudinaryUpload");

// profile create

router.post(
  "/create",
  auth,
  upload.single("profileImage"),
  async (req, res) => {
    const { userName, email, address, bio, dateOfBirth } = req.body;

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
        bio,
        dateOfBirth: dateOfBirth || null,
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
  const { userName, email, address, bio, profileImage, dateOfBirth } = req.body;

  try {
    const userId = req.user.id;
    const profile = await UserProfile.findOne({ userId });

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    profile.userName = userName;
    profile.email = email;
    profile.address = address;
    profile.bio = bio;
    if (dateOfBirth !== undefined) {
      profile.dateOfBirth = dateOfBirth || null;
    }

    // If a new file is uploaded, use it
    if (req.file) {
      profile.profileImage = req.file.path;
    }
    // If frontend explicitly sends null / remove signal, clear it
    else if (
      profileImage === "null" ||
      profileImage === null ||
      profileImage === ""
    ) {
      profile.profileImage = null;
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
    const profile = await UserProfile.findOne({
      userId: req.user.id,
    });

    if (!profile) {
      return res.status(404).json({
        message: "Profile not found",
      });
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
        isVerified: profile.isVerified,
        isPublic: profile.isPublic,
        bio: profile.bio,
        dateOfBirth: profile.dateOfBirth,
        birthdayReward: profile.birthdayReward,
        id: profile._id,
      },
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Server Error",
      error: err.message,
    });
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
      userId: profile.userId,
      isVerified: profile.isVerified,
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
      isVerified: profile.isVerified,
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

router.post("/push-tokens", auth, async (req, res) => {
  const { token, deviceName } = req.body;

  if (!token || typeof token !== "string") {
    return res.status(400).json({
      success: false,
      message: "Push token is required",
    });
  }

  try {
    const normalizedToken = token.trim();
    const profile = await UserProfile.findOne({ userId: req.user.id });

    if (!profile) {
      return res
        .status(404)
        .json({ success: false, message: "Profile not found" });
    }

    const existingTokenIndex = (profile.pushTokens || []).findIndex(
      (entry) => entry.token === normalizedToken,
    );

    if (existingTokenIndex !== -1) {
      profile.pushTokens[existingTokenIndex].deviceName = deviceName || null;
      profile.pushTokens[existingTokenIndex].lastSeenAt = new Date();
    } else {
      profile.pushTokens.push({
        token: normalizedToken,
        deviceName: deviceName || null,
        lastSeenAt: new Date(),
      });
    }

    await profile.save();

    res.status(200).json({
      success: true,
      message: "Push token registered successfully",
      tokensCount: profile.pushTokens.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
});

router.delete("/push-tokens", auth, async (req, res) => {
  const { token } = req.body;

  if (!token || typeof token !== "string") {
    return res.status(400).json({
      success: false,
      message: "Push token is required",
    });
  }

  try {
    const profile = await UserProfile.findOneAndUpdate(
      { userId: req.user.id },
      {
        $pull: {
          pushTokens: { token: token.trim() },
        },
      },
      { new: true },
    );

    if (!profile) {
      return res
        .status(404)
        .json({ success: false, message: "Profile not found" });
    }

    res.status(200).json({
      success: true,
      message: "Push token removed successfully",
      tokensCount: profile.pushTokens.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
});

// Claim birthday reward
router.post("/claim-birthday-reward", auth, async (req, res) => {
  try {
    const profile = await UserProfile.findOne({ userId: req.user.id });

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    if (!profile.dateOfBirth) {
      return res.status(400).json({ message: "Date of birth not set" });
    }

    const today = new Date();
    const dob = new Date(profile.dateOfBirth);

    const isBirthdayToday =
      today.getDate() === dob.getDate() && today.getMonth() === dob.getMonth();

    if (!isBirthdayToday) {
      return res.status(400).json({ message: "It's not your birthday today" });
    }

    const currentYear = today.getFullYear();

    if (profile.birthdayReward?.lastClaimedYear === currentYear) {
      return res
        .status(400)
        .json({ message: "Reward already claimed this year" });
    }

    profile.birthdayReward = {
      ...(profile.birthdayReward?.toObject?.() || profile.birthdayReward || {}),
      lastClaimedYear: currentYear,
    };

    await profile.save();

    res.status(200).json({
      success: true,
      message: "Happy Birthday! Reward claimed successfully",
      reward: {
        type: "badge",
        label: "Birthday Star",
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
});

module.exports = router;
