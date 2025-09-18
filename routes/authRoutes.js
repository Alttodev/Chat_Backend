const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const router = express.Router();

const User = require("../models/authUser");
const { default: axios } = require("axios");
const { requestPasswordReset } = require("../controllers/requestPassword");
const { resetPassword } = require("../controllers/resetPassword");

//Signup

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

    const payload = {
      user: {
        id: user._id,
      },
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
      (err, token) => {
        if (err) {
          return res.status(500).send("Error generating token");
        }
        res.status(201).json({
          message: "SignUp successfully",
          token,
          user: { _id: user._id, email: user.email },
        });
      }
    );
  } catch (err) {
    res.status(500).send("Error in Saving");
  }
});

//Login

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
    if (!user)
      return res.status(400).json({ message: "User not found, please signup" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Incorrect Password" });

    user.lastLogin = new Date();
    await user.save();

    const payload = { user: { id: user._id } };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
      (err, token) => {
        if (err) return res.status(500).send("Error generating token");
        res.status(201).json({
          message: "Login successful",
          token,
          user: {
            _id: user._id,
            email: user.email,
            lastLogin: user.lastLogin,
            changedPassword: user.lastPasswordChange,
          },
        });
      }
    );
  } catch (e) {
    console.error("Login error:", e.message);
    res.status(500).json({ message: "Server Error" });
  }
});

router.post("/requestPasswordReset", requestPasswordReset);
router.post("/resetPassword/:id/:token", resetPassword);

module.exports = router;
