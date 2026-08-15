const express = require("express");
const { AccessToken } = require("livekit-server-sdk");
const LiveSession = require("../models/liveSession");
// Adjust this path to wherever your "user" profile model file actually is.
const User = require("../models/userCreate");
const router = express.Router();

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

router.post("/end", requireAuth, async (req, res) => {
  const { id: userId } = req.user;
  await LiveSession.deleteOne({ userId });
  res.json({ ok: true });
});

/**
 * GET /live/active
 * Manual join instead of .populate() — LiveSession.userId stores the
 * authUser id, but the User profile collection's _id is different; the
 * link is the User schema's own `userId` field, not its `_id`. Mongoose
 * populate() can only match against `_id`, so it can never work here.
 */
router.get("/active", requireAuth, async (req, res) => {
  const { id: currentUserId } = req.user;

  const sessions = await LiveSession.find({ userId: { $ne: currentUserId } })
    .sort({ startedAt: -1 })
    .lean();

  if (sessions.length === 0) {
    return res.json([]);
  }

  const hostIds = sessions.map((s) => s.userId);

  const profiles = await User.find({ userId: { $in: hostIds } })
    .select("userId userName profileImage")
    .lean();

  const profileByUserId = new Map(
    profiles.map((p) => [String(p.userId), p])
  );

  const valid = [];
  const orphanedIds = [];

  for (const session of sessions) {
    const profile = profileByUserId.get(String(session.userId));
    if (!profile) {
      orphanedIds.push(session._id);
      continue;
    }
    valid.push({
      userId: session.userId,
      username: profile.userName,
      avatarUrl: profile.profileImage,
      viewerCount: session.viewerCount,
      startedAt: session.startedAt,
    });
  }

  // Clean up sessions with no matching profile (deleted/test accounts)
  if (orphanedIds.length > 0) {
    await LiveSession.deleteMany({ _id: { $in: orphanedIds } });
  }

  res.json(valid);
});

module.exports = router;