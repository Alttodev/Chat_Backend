const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

const generateJitsiToken = (roomName, userData) => {
  const secret = process.env.JITSI_SECRET || "your-secret-key";
  const appId = process.env.JITSI_APP_ID || "your-app-id";
  
  const payload = {
    aud: appId,
    iss: appId,
    sub: roomName,
    room: roomName,
    ...userData,
  };

  return jwt.sign(payload, secret, { algorithm: "HS256", expiresIn: "1h" });
};

router.get("/get-jitsi-token", (req, res) => {
  try {
    const roomName = req.query.roomName || "my-room";
    const token = generateJitsiToken(roomName, {
      name: req.query.name || "User",
      email: req.query.email || "user@gmail.com",
    });

    res.json({ token, success: true });
  } catch (error) {
    console.error("Error generating Jitsi token:", error);
    res.status(500).json({ success: false, message: "Failed to generate token" });
  }
});

module.exports = router;
