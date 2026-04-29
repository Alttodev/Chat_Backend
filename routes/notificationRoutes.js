const express = require("express");
const mongoose = require("mongoose");
const auth = require("../middleware/auth");
const User = require("../models/userCreate");
const FollowRequest = require("../models/followRequest");
const ChatMessage = require("../models/chatMessage");
const Notification = require("../models/notification");

const router = express.Router();

const toDateValue = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
};

const getCurrentUser = async (authUserId) => {
  return User.findOne({ userId: authUserId }).lean();
};

const mapCommentMentionNotification = (notification) => {
  if (!notification) {
    return null;
  }

  return {
    type: "comment-mention",
    notificationId: notification._id,
    createdAt: notification.createdAt,
    isRead: notification.isRead,
    postId: notification.post?._id || notification.post,
    commentId: notification.commentId,
    comment: notification.comment,
    from: notification.from,
    post: notification.post,
    message: `${notification.from?.userName || "Someone"} mentioned you in a comment`,
  };
};

router.get("/", auth, async (req, res) => {
  try {
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 30, 1),
      100,
    );
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Get conversation IDs where current user is a participant
    const userConversationIds = await mongoose
      .model("Conversation")
      .find({
        participants: currentUser._id,
      })
      .distinct("_id");

    const unreadMessageFilter = {
      sender: { $ne: currentUser._id },
      seenBy: { $ne: currentUser._id },
      conversation: { $in: userConversationIds },
    };

    const [pendingFollowRequests, unreadMessages] = await Promise.all([
      FollowRequest.find({
        to: currentUser._id,
        status: "pending",
        isDeleted: false,
      })
        .populate("from", "userName email profileImage isOnline lastSeen")
        .sort({ createdAt: -1 })
        .lean(),
      ChatMessage.find(unreadMessageFilter)
        .populate("sender", "userName email profileImage isOnline lastSeen")
        .populate("conversation", "participants lastMessageAt")
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const commentMentionNotifications = await Notification.find({
      to: currentUser._id,
      type: "comment-mention",
      isDeleted: false,
      isRead: false,
    })
      .populate("from", "userName email profileImage isOnline lastSeen")
      .populate("post", "postText image createdAt user")
      .sort({ createdAt: -1 })
      .lean();

    const followNotifications = pendingFollowRequests
      .filter((request) => !!request.from)
      .map((request) => ({
        type: "follow-request",
        notificationId: `follow-${request._id}`,
        createdAt: request.createdAt,
        followRequestId: request._id,
        from: request.from,
      }));

    const chatByConversation = new Map();
    const currentUserId = currentUser._id.toString();

    unreadMessages.forEach((message) => {
      if (!message.conversation || !message.sender) {
        return;
      }

      const conversationId = message.conversation._id.toString();
      const existing = chatByConversation.get(conversationId);

      if (!existing) {
        const participantIds = (message.conversation.participants || []).map(
          (id) => id.toString(),
        );

        chatByConversation.set(conversationId, {
          type: "chat-message",
          notificationId: `chat-${conversationId}`,
          createdAt: message.createdAt,
          conversationId,
          unreadCount: 1,
          from: message.sender,
          message: {
            messageId: message._id,
            text: message.text,
            image: message.image,
            type: message.type,
            createdAt: message.createdAt,
          },
          otherParticipantIds: participantIds.filter(
            (id) => id !== currentUserId,
          ),
        });
        return;
      }

      existing.unreadCount += 1;
    });

    const chatNotifications = Array.from(chatByConversation.values()).sort(
      (a, b) => toDateValue(b.createdAt) - toDateValue(a.createdAt),
    );

    const mentionNotifications = commentMentionNotifications
      .map(mapCommentMentionNotification)
      .filter(Boolean)
      .sort((a, b) => toDateValue(b.createdAt) - toDateValue(a.createdAt));

    const mergedNotifications = [
      ...followNotifications,
      ...chatNotifications,
      ...mentionNotifications,
    ].sort((a, b) => toDateValue(b.createdAt) - toDateValue(a.createdAt));

    res.status(200).json({
      success: true,
      message: "Notifications fetched successfully",
      counts: {
        followRequests: followNotifications.length,
        unreadConversations: chatNotifications.length,
        unreadMessages: unreadMessages.length,
        commentMentions: mentionNotifications.length,
        total:
          followNotifications.length +
          chatNotifications.length +
          mentionNotifications.length,
      },
      notifications: mergedNotifications.slice(0, limit),
      followRequestNotifications: followNotifications,
      chatNotifications,
      commentMentionNotifications: mentionNotifications,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/counts", auth, async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Get conversation IDs where current user is a participant
    const userConversationIds = await mongoose
      .model("Conversation")
      .find({
        participants: currentUser._id,
      })
      .distinct("_id");

    const unreadMessageFilter = {
      sender: { $ne: currentUser._id },
      seenBy: { $ne: currentUser._id },
      conversation: { $in: userConversationIds },
    };

    const [followRequests, unreadMessages, unreadConversationIds, commentMentions] =
      await Promise.all([
        FollowRequest.countDocuments({
          to: currentUser._id,
          status: "pending",
          isDeleted: false,
        }),
        ChatMessage.countDocuments(unreadMessageFilter),
        ChatMessage.distinct("conversation", unreadMessageFilter),
        Notification.countDocuments({
          to: currentUser._id,
          type: "comment-mention",
          isDeleted: false,
          isRead: false,
        }),
      ]);

    res.status(200).json({
      success: true,
      message: "Notification counts fetched successfully",
      counts: {
        followRequests,
        unreadConversations: unreadConversationIds.length,
        unreadMessages,
        commentMentions,
        total: followRequests + unreadConversationIds.length + commentMentions,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.put("/seen", auth, async (req, res) => {
  try {
    const {
      type,
      followRequestId,
      conversationId,
      notificationId,
    } = req.body;
    const currentUser = await getCurrentUser(req.user.id);

    if (!currentUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (type === "follow-request") {
      if (
        !followRequestId ||
        !mongoose.Types.ObjectId.isValid(followRequestId)
      ) {
        return res.status(400).json({
          success: false,
          message: "Valid followRequestId is required",
        });
      }

      const request = await FollowRequest.findOneAndUpdate(
        {
          _id: followRequestId,
          to: currentUser._id,
          status: "pending",
          isDeleted: false,
        },
        { isDeleted: true },
        { new: true },
      );

      if (!request) {
        return res.status(404).json({
          success: false,
          message: "Notification not found",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Follow notification marked as seen",
      });
    }

    if (type === "chat-message") {
      if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
        return res.status(400).json({
          success: false,
          message: "Valid conversationId is required",
        });
      }

      const result = await ChatMessage.updateMany(
        {
          conversation: conversationId,
          sender: { $ne: currentUser._id },
          seenBy: { $ne: currentUser._id },
        },
        {
          $addToSet: { seenBy: currentUser._id },
        },
      );

      return res.status(200).json({
        success: true,
        message: "Chat notification marked as seen",
        updatedCount: result.modifiedCount || 0,
      });
    }

    if (type === "comment-mention") {
      if (!notificationId || !mongoose.Types.ObjectId.isValid(notificationId)) {
        return res.status(400).json({
          success: false,
          message: "Valid notificationId is required",
        });
      }

      const notification = await Notification.findOneAndUpdate(
        {
          _id: notificationId,
          to: currentUser._id,
          type: "comment-mention",
          isDeleted: false,
          isRead: false,
        },
        { isRead: true },
        { new: true },
      );

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: "Notification not found",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Comment mention notification marked as seen",
      });
    }

    return res.status(400).json({
      success: false,
      message: "Invalid notification type",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
