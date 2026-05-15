const User = require("../models/userCreate");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
require("dotenv").config();

const createTransporter = () => {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
};

const requestVerification = async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.user.id });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "User already verified",
      });
    }

    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "30m",
      }
    );

    const verifyURL = `${process.env.FRONTEND_URL}/verify-account?token=${token}`;

    const transporter = createTransporter();
    await transporter.verify();

    await transporter.sendMail({
      from: `"Clix" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: "Verify Your Account",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Account Verification</h2>
          <p>Hello ${user.userName},</p>
          <p>Click the button below to verify your account.</p>
          <a 
            href="${verifyURL}" 
            style="
              background:#10b981;
              color:white;
              padding:10px 20px;
              text-decoration:none;
              border-radius:6px;
              display:inline-block;
              cursor:pointer;
            "
          >
            Verify Account
          </a>
          <p style="margin-top:20px;">This link expires in 30 minutes.</p>
        </div>
      `,
    });

    return res.status(200).json({
      success: true,
      message: "Verification email sent",
    });
  } catch (error) {
    console.error("Request verification error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send verification email",
      error: error.message,
    });
  }
};

const verifyAccount = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Token is required",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.email !== decoded.email) {
      return res.status(400).json({
        success: false,
        message: "Invalid token",
      });
    }

    user.emailVerified = true;
    user.isVerified = true;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Account verified successfully",
      user,
    });
  } catch (error) {
  
    return res.status(400).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

module.exports = {
  requestVerification,
  verifyAccount,
};