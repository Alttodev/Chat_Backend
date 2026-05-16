const User = require("../models/authUser");
const jwt = require("jsonwebtoken");
const { Resend } = require("resend");

require("dotenv").config();

const resend = new Resend(process.env.RESEND_API_KEY);

const requestPasswordReset = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      message: "Email is required",
    });
  }

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        message: "No account found with this email",
      });
    }

    const secret = process.env.JWT_SECRET + user.password;

    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
      },
      secret,
      {
        expiresIn: "15m",
      }
    );

    const resetURL = `${process.env.FRONTEND_URL}/reset-password?token=${token}&id=${user._id}`;

    await resend.emails.send({
      from: "Clix <noreply@clixapp.site>",
      to: user.email,
      subject: "Password Reset Request",

      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Password Reset</h2>

          <p>
            You requested a password reset. Click the button below:
          </p>

          <a
            href="${resetURL}"
            style="
              background: #059669;
              color: white;
              padding: 12px 20px;
              text-decoration: none;
              border-radius: 8px;
              display: inline-block;
              font-weight: 600;
            "
          >
            Reset Password
          </a>

          <p style="margin-top: 20px;">
            This link expires in 15 minutes.
          </p>

          <p>
            If you didn't request this, please ignore this email.
          </p>
        </div>
      `,
    });

    res.status(200).json({
      message: "Password reset link sent to your email",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Failed to process reset request",
      error: error.message,
    });
  }
};

module.exports = { requestPasswordReset };