const User = require("../models/authUser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const resetPassword = async (req, res) => {
  const { id, token } = req.params;
  const { password } = req.body;

  try {
    const user = await User.findById(id);
    if (!user) {
      return res.status(400).json({ message: "User not exists" });
    }

    const secret = process.env.JWT_SECRET + user.password;

    jwt.verify(token, secret);

    const encryptedPassword = await bcrypt.hash(password, 10);
    user.password = encryptedPassword;

    await user.save();

    res.status(200).json({ message: "Password has been reset successfully" });
  } catch (error) {
    res.status(400).json({ message: "Invalid or expired token" });
  }
};

module.exports = { resetPassword };
