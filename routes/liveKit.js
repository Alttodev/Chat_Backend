const express = require("express");
const { AccessToken } = require("livekit-server-sdk");
const LiveSession = require("../models/liveSession");
const LiveComment = require("../models/liveComment");
const User = require("../models/userCreate");
const FollowRequest = require("../models/followRequest");
const router = express.Router();

const requireAuth = require("../middleware/auth");

async function areMutualFriends(currentUserId, otherUserId) {
  if (!currentUserId || !otherUserId || currentUserId === otherUserId) {
    return true;
  }

  const currentProfile = await User.findOne({ userId: currentUserId })
    .select("_id")
    .lean();
  const otherProfile = await User.findOne({ userId: otherUserId })
    .select("_id")
    .lean();

  if (!currentProfile || !otherProfile) {
    return false;
  }

  const request = await FollowRequest.findOne({
    status: "accepted",
    isFriends: true,
    $or: [
      { from: currentProfile._id, to: otherProfile._id },
      { from: otherProfile._id, to: currentProfile._id },
    ],
  }).lean();

  return Boolean(request);
}

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
    },
  );

  at.addGrant({
    room: roomName,
    roomJoin: true,
    roomCreate: true,
    canPublish: true,
    canSubscribe: true,
  });

  // If a stale session exists (e.g. from a crashed tab that never called
  // /end), clear out ITS old comments before reusing/creating a session,
  // so nothing carries over into the new broadcast.
  const stale = await LiveSession.findOne({ userId });
  if (stale) {
    await LiveComment.deleteMany({ sessionId: stale._id });
  }

  const session = await LiveSession.findOneAndUpdate(
    { userId },
    { userId, roomName, startedAt: new Date(), viewerCount: 0 },
    { upsert: true, new: true },
  );

  res.json({
    token: await at.toJwt(),
    url: process.env.LIVEKIT_URL,
    roomName,
    // Fresh per broadcast — this is what scopes comments to THIS session
    // only, instead of to the user (whose id never changes).
    sessionId: session._id,
  });
});

router.post("/join/:hostUserId", requireAuth, async (req, res) => {
  const { id: viewerId, username } = req.user;
  const { hostUserId } = req.params;
  const roomName = `live-${hostUserId}`;

  if (viewerId !== hostUserId) {
    const isFriend = await areMutualFriends(viewerId, hostUserId);
    if (!isFriend) {
      return res
        .status(403)
        .json({ error: "Only mutual friends can join this live stream." });
    }
  }

  const session = await LiveSession.findOne({ userId: hostUserId });
  if (!session) {
    return res.status(404).json({ error: "This user isn't live right now." });
  }

  const hostProfile = await User.findOne({ userId: hostUserId })
    .select("userName profileImage")
    .lean();

  const viewerProfile = await User.findOne({ userId: viewerId })
    .select("userName profileImage")
    .lean();

  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    {
      identity: viewerId,
      name: viewerProfile?.userName || username,
      metadata: JSON.stringify({
        avatarUrl: viewerProfile?.profileImage || null,
      }),
    },
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
    sessionId: session._id,
    hostUsername: hostProfile?.userName || "Unknown",
    hostAvatarUrl: hostProfile?.profileImage || null,
  });
});

router.post("/end", requireAuth, async (req, res) => {
  const { id: userId } = req.user;

  const session = await LiveSession.findOne({ userId });
  if (session) {
    // Clean up this session's comments now, not just on the next /start —
    // keeps the DB tidy even if the host never streams again.
    await LiveComment.deleteMany({ sessionId: session._id });
    await LiveSession.deleteOne({ _id: session._id });
  }

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

  const currentProfile = await User.findOne({ userId: currentUserId })
    .select("_id")
    .lean();

  if (!currentProfile) {
    return res.json([]);
  }

  const friendRelations = await FollowRequest.find({
    status: "accepted",
    isFriends: true,
    $or: [{ from: currentProfile._id }, { to: currentProfile._id }],
  })
    .select("from to")
    .lean();

  const friendProfileIds = new Set(
    friendRelations
      .flatMap((relation) => [
        relation.from?.toString(),
        relation.to?.toString(),
      ])
      .filter((id) => id && id !== currentProfile._id.toString()),
  );

  const sessions = await LiveSession.find({ userId: { $ne: currentUserId } })
    .sort({ startedAt: -1 })
    .lean();

  if (sessions.length === 0) {
    return res.json([]);
  }

  const hostIds = sessions.map((s) => s.userId);

  const profiles = await User.find({ userId: { $in: hostIds } })
    .select("_id userId userName profileImage")
    .lean();

  const profileByUserId = new Map(profiles.map((p) => [String(p.userId), p]));

  const valid = [];
  const orphanedIds = [];

  for (const session of sessions) {
    const profile = profileByUserId.get(String(session.userId));
    if (!profile) {
      orphanedIds.push(session._id);
      continue;
    }

    if (!friendProfileIds.has(profile._id.toString())) {
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

/**
 * POST /live/comment/:sessionId
 * Scoped to the LIVE SESSION, not the user — so ending a broadcast and
 * starting a new one always starts with a clean comment thread.
 */
router.post("/comment/:sessionId", requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  const { text } = req.body;
  const { id: userId, username } = req.user;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Comment can't be empty." });
  }

  const profile = await User.findOne({ userId })
    .select("userName profileImage")
    .lean();

  const comment = await LiveComment.create({
    sessionId,
    userId,
    username: profile?.userName || username || "Unknown",
    avatarUrl: profile?.profileImage || null,
    text: text.trim().slice(0, 200),
  });

  res.json({ comment });
});

/**
 * GET /live/comments/:sessionId
 * Poll this every ~500ms while watching a stream for a live-chat feel.
 */
router.get("/comments/:sessionId", requireAuth, async (req, res) => {
  const { sessionId } = req.params;

  const comments = await LiveComment.find({ sessionId })
    .sort({ createdAt: 1 })
    .limit(100)
    .lean();

  res.json(comments);
});

module.exports = router;
