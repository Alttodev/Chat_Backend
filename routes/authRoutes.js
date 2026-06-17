const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const router = express.Router();
const passport = require("passport");
const UserProfile = require("../models/userCreate");
const User = require("../models/authUser");
const { default: axios } = require("axios");
const { requestPasswordReset } = require("../controllers/requestPassword");
const { resetPassword } = require("../controllers/resetPassword");
const Subscription = require("../models/subscription");

// ─── Signup ───────────────────────────────────────────────────────────────────

router.post("/signup", async (req, res) => {
  const { email, password } = req.body;
  try {
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ msg: "User Already Exists" });
    }

    user = new User({ email, password });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    await user.save();

    const payload = { user: { id: user._id } };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: "10d" },
      (err, token) => {
        if (err) return res.status(500).send("Error generating token");
        res.status(201).json({
          success: true,
          message: "SignUp successfully",
          token,
          user: { _id: user._id, email: user.email },
        });
      },
    );
  } catch (err) {
    res.status(500).send("Error in Saving");
  }
});

// ─── Login ────────────────────────────────────────────────────────────────────

router.post("/login", async (req, res) => {
  const { email, password, captcha } = req.body;

  if (!captcha) {
    return res.status(400).json({
      success: false,
      message: "Captcha token is required",
    });
  }

  try {
    const secret = process.env.GOOGLE_CAPTCHA_SECRET_KEY;
    const verifyUrl = "https://www.google.com/recaptcha/api/siteverify";

    const googleRes = await axios.post(verifyUrl, null, {
      params: { secret, response: captcha },
    });

    const gData = googleRes.data;

    if (!gData.success) {
      return res.status(400).json({
        success: false,
        message: "Captcha verification failed",
        errors: gData["error-codes"],
      });
    }

    let user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        message: "User not found, please signup",
      });
    }

    const profile = await UserProfile.findOne({ userId: user._id });

    const subscription = await Subscription.findOne({
      userId: user._id,
      isActive: true,
    });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Incorrect Password" });

    user.lastLogin = new Date();
    await user.save();

    const payload = { user: { id: user._id } };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: "10d" },
      (err, token) => {
        if (err) return res.status(500).send("Error generating token");
        res.status(201).json({
          success: true,
          message: "Login successful",
          token,
          user: {
            _id: user._id,
            email: user.email,
            userName: profile?.userName,
            profileImage: profile?.profileImage || null,
            subscriptionEndDate: subscription?.subscriptionEndDate || null,
            planType: subscription?.planType || null,
            lastLogin: user.lastLogin,
            changedPassword: user.lastPasswordChange,
          },
        });
      },
    );
  } catch (e) {
    console.error("Login error:", e.message);
    res.status(500).json({ message: "Server Error" });
  }
});

// ─── Google OAuth ─────────────────────────────────────────────────────────────

// Step 1: Redirect user to Google consent screen
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] }),
);

// Step 2: Google redirects back here after user consents
router.get(
  "/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: `${process.env.CLIENT_URL}/login?error=google_failed` }),
  async (req, res) => {
    try {
      const user = req.user; // set by passport strategy

      const profile = await UserProfile.findOne({ userId: user._id });
      const subscription = await Subscription.findOne({
        userId: user._id,
        isActive: true,
      });

      const payload = { user: { id: user._id } };

      jwt.sign(
        payload,
        process.env.JWT_SECRET,
        { expiresIn: "10d" },
        (err, token) => {
          if (err) {
            return res.redirect(`${process.env.CLIENT_URL}/login?error=token_failed`);
          }

          // Encode user data as a query param so the frontend can store it
          const userData = encodeURIComponent(
            JSON.stringify({
              _id: user._id,
              email: user.email,
              userName: profile?.userName || null,
              profileImage: profile?.profileImage || null,
              subscriptionEndDate: subscription?.subscriptionEndDate || null,
              planType: subscription?.planType || null,
            }),
          );

          // Redirect to frontend with token + user data
          res.redirect(
            `${process.env.CLIENT_URL}/auth/google/success?token=${token}&user=${userData}`,
          );
        },
      );
    } catch (err) {
      console.error("Google callback error:", err.message);
      res.redirect(`${process.env.CLIENT_URL}/login?error=server_error`);
    }
  },
);

// ─── Password Reset ───────────────────────────────────────────────────────────

router.post("/requestPasswordReset", requestPasswordReset);
router.post("/resetPassword/:id/:token", resetPassword);

module.exports = router;