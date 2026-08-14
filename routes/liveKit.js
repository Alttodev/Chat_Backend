const express = require("express");
const { AccessToken } = require("livekit-server-sdk");
const LiveSession = require("../models/LiveSession");
const router = express.Router();

// Replace with your real auth middleware — assumes req.user is populated.
const requireAuth = require("../middleware/auth");

router.post("/start", requireAuth, async (req, res) => {
  const { id: userId, username, avatarUrl } = req.user;
  const roomName = `live-${userId}`;

  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    {
      identity: userId,
      name: username,
      metadata: JSON.stringify({ avatarUrl }),
    }
  );

  at.addGrant({
    room: roomName,
    roomJoin: true,
    roomCreate: true,
    canPublish: true,
    canSubscribe: true,
  });

  // upsert: if they had a stale session from a crashed tab, replace it
  await LiveSession.findOneAndUpdate(
    { userId },
    { userId, roomName, startedAt: new Date(), viewerCount: 0 },
    { upsert: true, new: true }
  );

  res.json({
    token: await at.toJwt(),
    url: process.env.LIVEKIT_URL,
    roomName,
  });
});

/**
 * POST /api/live/join/:hostUserId
 * Subscribe-only token for a viewer, plus a viewer-count bump.
 */
router.post("/join/:hostUserId", requireAuth, async (req, res) => {
  const { id: viewerId, username } = req.user;
  const { hostUserId } = req.params;
  const roomName = `live-${hostUserId}`;

  const session = await LiveSession.findOne({ userId: hostUserId });
  if (!session) {
    return res.status(404).json({ error: "This user isn't live right now." });
  }

  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    { identity: viewerId, name: username }
  );

  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: false,
    canSubscribe: true,
  });

  session.viewerCount += 1;
  await session.save();

  res.json({
    token: await at.toJwt(),
    url: process.env.LIVEKIT_URL,
    roomName,
  });
});

/**
 * POST /api/live/end
 * Removes the session so the "Live" badge disappears everywhere.
 */
router.post("/end", requireAuth, async (req, res) => {
  const { id: userId } = req.user;
  await LiveSession.deleteOne({ userId });
  res.json({ ok: true });
});

router.get("/active", requireAuth, async (req, res) => {
  const sessions = await LiveSession.find({})
    .populate("userId", "username avatarUrl")
    .sort({ startedAt: -1 })
    .lean();

  res.json(
    sessions.map((s) => ({
      userId: s.userId._id,
      username: s.userId.username,
      avatarUrl: s.userId.avatarUrl,
      viewerCount: s.viewerCount,
      startedAt: s.startedAt,
    }))
  );
});

module.exports = router;