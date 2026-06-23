const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const AuthUser = require("../models/authUser");
const User = require("../models/userCreate");
const Post = require("../models/postCreate");
const FollowRequests = require("../models/followRequest");
const Notification = require("../models/notification");
const ProfileView = require("../models/profileView");
const Status = require("../models/status");
const Subscription = require("../models/subscription");
const Conversation = require("../models/conversation");
const ChatMessage = require("../models/chatMessage");
const ChatBlock = require("../models/chatBlock");
const auth = require("../middleware/auth");

router.delete("/delete-account", auth, async (req, res) => {
  try {
    const authUserId = req.user.id;

    const profile = await User.findOne({
      userId: authUserId,
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const profileId = profile._id;

    // Delete posts created by user
    await Post.deleteMany({
      user: profileId,
    });

    await Post.updateMany(
      {},
      {
        $pull: {
          comments: { user: profileId },
          likedBy: { user: profileId },
          bookmarkedBy: { user: profileId },
        },
      },
    );

    await Post.updateMany(
      { "comments.reactions.user": profileId },
      { $pull: { "comments.$[].reactions": { user: profileId } } },
    );

    const affectedPosts = await Post.find({}, "_id likedBy bookmarkedBy");
    await Promise.all(
      affectedPosts.map((post) =>
        Post.updateOne(
          { _id: post._id },
          {
            likes: post.likedBy.length,
            bookmarks: post.bookmarkedBy.length,
          },
        ),
      ),
    );

    // Delete statuses
    await Status.deleteMany({
      userId: profileId,
    });

    // Delete follow requests
    await FollowRequests.deleteMany({
      $or: [{ from: profileId }, { to: profileId }],
    });

    // Delete notifications
    await Notification.deleteMany({
      $or: [{ from: profileId }, { to: profileId }],
    });

    // Delete profile views
    await ProfileView.deleteMany({
      $or: [{ viewer: profileId }, { viewedUser: profileId }],
    });

    // Delete chat blocks
    await ChatBlock.deleteMany({
      $or: [{ blocker: profileId }, { blocked: profileId }],
    });

    // Delete chat messages
    await ChatMessage.deleteMany({
      sender: profileId,
    });

    // Delete conversations
    await Conversation.deleteMany({
      participants: profileId,
    });

    // Delete subscriptions
    await Subscription.deleteMany({
      userId: authUserId,
    });

    // Delete user profile
    await User.findByIdAndDelete(profileId);

    // Delete auth account
    await AuthUser.findByIdAndDelete(authUserId);

    res.status(200).json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;
