const User = require("../models/authUser");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
require("dotenv").config();

const requestPasswordReset = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json({ message: "No account found with this email" });
    }

    const secret = process.env.JWT_SECRET + user.password;
    const token = jwt.sign({ id: user._id, email: user.email }, secret, {
      expiresIn: "15m",
    });

    const resetURL = `${process.env.FRONTEND_URL}/reset-password?token=${token}&id=${user._id}`;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: `"Clix" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: "Password Reset Request",
      html: `
        <h2>Password Reset</h2>
        <p>You requested a password reset. Click the button below:</p>
        <a href="${resetURL}" style="
          background:green;
          color: white;
          padding: 10px 20px;
          text-decoration: none;
          border-radius: 5px;
          display: inline-block;
        ">Reset Password</a>
        <p>This link expires in 15 minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `,
    });

    res.status(200).json({ message: "Password reset link sent to your email" });
  } catch (error) {
    res.status(500).json({
      message: "Failed to process reset request",
      error: error.message,
    });
  }
};

module.exports = { requestPasswordReset };
