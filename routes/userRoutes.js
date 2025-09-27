const express = require("express");
const router = express.Router();
const UserProfile = require("../models/userCreate");
const auth = require("../middleware/auth");

// profile create

router.post("/create", auth, async (req, res) => {
  const { userName, email, address } = req.body;

  try {
    const userId = req.user.id;
    const existingProfile = await UserProfile.findOne({ userId });
    if (existingProfile) {
      return res.status(400).json({ message: "Profile already exists" });
    }

    const profile = new UserProfile({ userId, userName, email, address });
    await profile.save();

    res.status(201).json({
      success: true,
      message: "Profile created successfully",
      profile,
    });
  } catch (e) {
    res.status(500).json({ message: "Server Error" });
  }
});

// Update profile
router.put("/update", auth, async (req, res) => {
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
        userName: profile.userName,
        email: profile.email,
        address: profile.address,
        memberSince: profile.createdAt,
        lastUpdated: profile.updatedAt,
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
      memberSince: profile.createdAt,
      lastUpdated: profile.updatedAt,
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

module.exports = router;
