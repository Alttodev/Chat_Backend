const express = require("express");
const auth = require("../middleware/auth");
const UserProfile = require("../models/userCreate");
const router = express.Router();

//Account privacy
router.patch("/privacy", auth, async (req, res) => {
  try {
    const { isPublic } = req.body;

    const user = await UserProfile.findOne({ userId: req.user.id });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.isPublic = Boolean(isPublic);

    await user.save();

    return res.status(200).json({
      success: true,
      message: user.isPublic
        ? "Account is now public"
        : "Account is now private",
      isPublic: user.isPublic,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

module.exports = router;
