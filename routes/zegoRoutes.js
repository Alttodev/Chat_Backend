const express = require("express");
const auth = require("../middleware/auth");
const { generateToken04 } = require("../utils/zegoToken");

const router = express.Router();

router.post("/token", auth, async (req, res) => {
  try {
    const appId = Number(process.env.ZEGO_APP_ID || process.env.VITE_ZEGO_APP_ID);
    const serverSecret = String(
      process.env.ZEGO_SERVER_SECRET ||
        process.env.VITE_ZEGO_SERVER_SECRET ||
        ""
    ).trim();
    const effectiveTimeInSeconds = Number(process.env.ZEGO_TOKEN_EXPIRE_SECONDS || 3600);

    if (!appId || !serverSecret) {
      return res.status(500).json({
        success: false,
        message:
          "ZEGO server config missing. Set ZEGO_APP_ID and ZEGO_SERVER_SECRET in backend .env",
      });
    }

    if (serverSecret.length !== 32) {
      return res.status(500).json({
        success: false,
        message: "ZEGO_SERVER_SECRET must be exactly 32 characters",
      });
    }

    const authUserId = req.user.id.toString();
    const roomId = req.body?.roomId ? String(req.body.roomId).trim() : "";
    const privilege = req.body?.privilege;
    const streamIdList = Array.isArray(req.body?.streamIdList)
      ? req.body.streamIdList
      : null;

    let payload = "";
    if (roomId) {
      const payloadObject = {
        room_id: roomId,
        privilege: privilege || { 1: 1, 2: 1 },
        stream_id_list: streamIdList,
      };
      payload = JSON.stringify(payloadObject);
    }

    const token = generateToken04(
      appId,
      authUserId,
      serverSecret,
      effectiveTimeInSeconds,
      payload
    );

    res.status(200).json({
      success: true,
      message: "ZEGO token generated successfully",
      data: {
        appId,
        userId: authUserId,
        token,
        expiresIn: effectiveTimeInSeconds,
      },
    });
  } catch (err) {
    console.error("ZEGO token generation error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to generate ZEGO token",
      error: err?.message || "Unknown error",
    });
  }
});

module.exports = router;
