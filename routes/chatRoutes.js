const express = require("express");
const mongoose = require("mongoose");
const auth = require("../middleware/auth");
const upload = require("../middleware/cloudinaryUpload");
const User = require("../models/userCreate");
const Conversation = require("../models/conversation");
const ChatMessage = require("../models/chatMessage");
const ChatBlock = require("../models/chatBlock");
const FollowRequest = require("../models/followRequest");

module.exports = (io) => {
  const router = express.Router();

  const getConversation = async (userAId, userBId) => {
    const participants = [userAId, userBId];

    return Conversation.findOne({
      participants: { $all: participants, $size: 2 },
    });
  };

  const getCurrentUser = async (authUserId) => {
    return User.findOne({ userId: authUserId });
  };

  const getUserByAnyId = async (id) => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return null;
    }

    return User.findOne({
      $or: [{ _id: id }, { userId: id }],
    });
  };

  const formatMessagePayload = async (messageId) => {
    return ChatMessage.findById(messageId)
      .populate("sender", "userName email isOnline")
      .lean();
  };

  const isBlockedBetween = async (userAId, userBId) => {
    const block = await ChatBlock.findOne({
      $or: [
        { blocker: userAId, blocked: userBId },
        { blocker: userBId, blocked: userAId },
      ],
    }).lean();

    return !!block;
  };

  const areUsersMutualFollowers = async (userAId, userBId) => {
    const followA = await FollowRequest.findOne({
      from: userAId,
      to: userBId,
      status: "accepted",
      isFriends: true,
    }).lean();

    const followB = await FollowRequest.findOne({
      from: userBId,
      to: userAId,
      status: "accepted",
      isFriends: true,
    }).lean();

    return !!followA && !!followB;
  };

  router.post(
    "/conversations/:targetUserId/messages",
    auth,
    upload.single("image"),
    async (req, res) => {
      try {
        const { targetUserId } = req.params;
        const text = (req.body.text || "").trim();
        const image = req.file ? req.file.path : null;

        if (!text && !image) {
          return res.status(400).json({
            success: false,
            message: "Either text or image is required",
          });
        }

        const currentUser = await getCurrentUser(req.user.id);
        if (!currentUser) {
          return res
            .status(404)
            .json({ success: false, message: "User not found" });
        }

        const targetUser = await getUserByAnyId(targetUserId);
        if (!targetUser) {
          return res
            .status(404)
            .json({ success: false, message: "Target user not found" });
        }

        if (currentUser._id.toString() === targetUser._id.toString()) {
          return res.status(400).json({
            success: false,
            message: "You cannot chat with yourself",
          });
        }

        const blocked = await isBlockedBetween(currentUser._id, targetUser._id);
        if (blocked) {
          return res.status(403).json({
            success: false,
            message:
              "Message failed to send. One of you has blocked the other.",
          });
        }

        const areMutualFollowers = await areUsersMutualFollowers(
          currentUser._id,
          targetUser._id,
        );
        if (!areMutualFollowers) {
          return res.status(403).json({
            success: false,
            message: "You can only chat with users you both follow.",
          });
        }

        let conversation = await getConversation(
          currentUser._id,
          targetUser._id,
        );

        if (!conversation) {
          conversation = await Conversation.create({
            participants: [currentUser._id, targetUser._id],
            lastMessageAt: new Date(),
          });
        }

        const type = image && text ? "mixed" : image ? "image" : "text";

        const message = await ChatMessage.create({
          conversation: conversation._id,
          sender: currentUser._id,
          text,
          image,
          type,
          seenBy: [currentUser._id],
        });

        conversation.lastMessage = {
          text,
          image,
          type,
          sender: currentUser._id,
        };
        conversation.lastMessageAt = new Date();
        await conversation.save();

        const payload = await formatMessagePayload(message._id);

        io.to(targetUser.userId.toString()).emit("chat:message:new", {
          conversationId: conversation._id,
          message: payload,
        });

        io.to(currentUser.userId.toString()).emit("chat:message:new", {
          conversationId: conversation._id,
          message: payload,
        });

        res.status(201).json({
          success: true,
          message: "Message sent successfully",
          conversationId: conversation._id,
          chatMessage: payload,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server error" });
      }
    },
  );

  // router.get("/conversations", auth, async (req, res) => {
  //   try {
  //     const currentUser = await getCurrentUser(req.user.id);
  //     if (!currentUser) {
  //       return res
  //         .status(404)
  //         .json({ success: false, message: "User not found" });
  //     }

  //     const conversations = await Conversation.find({
  //       participants: currentUser._id,
  //     })
  //       .populate("participants", "userName email isOnline lastSeen")
  //       .populate("lastMessage.sender", "userName")
  //       .sort({ lastMessageAt: -1 })
  //       .lean();

  //     const otherParticipantIds = conversations
  //       .map((conversation) =>
  //         conversation.participants.find(
  //           (participant) =>
  //             participant?._id?.toString() !== currentUser._id.toString(),
  //         ),
  //       )
  //       .filter((participant) => !!participant?._id)
  //       .map((participant) => participant._id);

  //     const relatedBlocks = await ChatBlock.find({
  //       $or: [
  //         { blocker: currentUser._id, blocked: { $in: otherParticipantIds } },
  //         { blocker: { $in: otherParticipantIds }, blocked: currentUser._id },
  //       ],
  //     })
  //       .select("blocker blocked")
  //       .lean();

  //     const blockStatusByOtherUserId = new Map();

  //     relatedBlocks.forEach((block) => {
  //       const blockerId = block.blocker.toString();
  //       const blockedId = block.blocked.toString();
  //       const currentUserId = currentUser._id.toString();

  //       if (blockerId === currentUserId) {
  //         const existing = blockStatusByOtherUserId.get(blockedId) || {
  //           blockedByMe: false,
  //           blockedMe: false,
  //         };
  //         existing.blockedByMe = true;
  //         blockStatusByOtherUserId.set(blockedId, existing);
  //         return;
  //       }

  //       if (blockedId === currentUserId) {
  //         const existing = blockStatusByOtherUserId.get(blockerId) || {
  //           blockedByMe: false,
  //           blockedMe: false,
  //         };
  //         existing.blockedMe = true;
  //         blockStatusByOtherUserId.set(blockerId, existing);
  //       }
  //     });

  //     const conversationsWithMeta = await Promise.all(
  //       conversations.map(async (conversation) => {
  //         const unreadCount = await ChatMessage.countDocuments({
  //           conversation: conversation._id,
  //           sender: { $ne: currentUser._id },
  //           seenBy: { $ne: currentUser._id },
  //         });

  //         const otherParticipant = conversation.participants.find(
  //           (participant) =>
  //             participant?._id?.toString() !== currentUser._id.toString(),
  //         );

  //         const otherParticipantId = otherParticipant?._id?.toString();
  //         const blockStatus = otherParticipantId
  //           ? blockStatusByOtherUserId.get(otherParticipantId) || {
  //               blockedByMe: false,
  //               blockedMe: false,
  //             }
  //           : { blockedByMe: false, blockedMe: false };

  //         return {
  //           ...conversation,
  //           otherParticipant,
  //           blockedByMe: blockStatus.blockedByMe,
  //           blockedMe: blockStatus.blockedMe,
  //           isBlocked: blockStatus.blockedByMe || blockStatus.blockedMe,
  //           unreadCount,
  //         };
  //       }),
  //     );

  //     res.status(200).json({
  //       success: true,
  //       message: "Conversations fetched successfully",
  //       conversations: conversationsWithMeta,
  //     });
  //   } catch (err) {
  //     console.error(err);
  //     res.status(500).json({ success: false, message: "Server error" });
  //   }
  // });
  router.get("/conversations", auth, async (req, res) => {
    try {
      const currentUser = await getCurrentUser(req.user.id);
      if (!currentUser) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      const conversations = await Conversation.find({
        participants: currentUser._id,
      })
        .populate("participants", "userName email profileImage isOnline lastSeen")
        .populate("lastMessage.sender", "userName")
        .sort({ lastMessageAt: -1 })
        .lean();

      const otherParticipantIds = conversations
        .map((conversation) =>
          conversation.participants.find(
            (participant) =>
              participant?._id?.toString() !== currentUser._id.toString(),
          ),
        )
        .filter((participant) => !!participant?._id)
        .map((participant) => participant._id);

      const relatedBlocks = await ChatBlock.find({
        $or: [
          { blocker: currentUser._id, blocked: { $in: otherParticipantIds } },
          { blocker: { $in: otherParticipantIds }, blocked: currentUser._id },
        ],
      })
        .select("blocker blocked")
        .lean();

      const blockStatusByOtherUserId = new Map();

      relatedBlocks.forEach((block) => {
        const blockerId = block.blocker.toString();
        const blockedId = block.blocked.toString();
        const currentUserId = currentUser._id.toString();

        if (blockerId === currentUserId) {
          const existing = blockStatusByOtherUserId.get(blockedId) || {
            blockedByMe: false,
            blockedMe: false,
          };
          existing.blockedByMe = true;
          blockStatusByOtherUserId.set(blockedId, existing);
          return;
        }

        if (blockedId === currentUserId) {
          const existing = blockStatusByOtherUserId.get(blockerId) || {
            blockedByMe: false,
            blockedMe: false,
          };
          existing.blockedMe = true;
          blockStatusByOtherUserId.set(blockerId, existing);
        }
      });

      const conversationsWithMeta = await Promise.all(
        conversations.map(async (conversation) => {
          const otherParticipant = conversation.participants.find(
            (participant) =>
              participant?._id?.toString() !== currentUser._id.toString(),
          );

          if (!otherParticipant) return null;

          const isMutual = await areUsersMutualFollowers(
            currentUser._id,
            otherParticipant._id,
          );

          if (!isMutual) return null;

          const unreadCount = await ChatMessage.countDocuments({
            conversation: conversation._id,
            sender: { $ne: currentUser._id },
            seenBy: { $ne: currentUser._id },
          });

          const otherParticipantId = otherParticipant._id.toString();

          const blockStatus = blockStatusByOtherUserId.get(
            otherParticipantId,
          ) || {
            blockedByMe: false,
            blockedMe: false,
          };

          return {
            ...conversation,
            otherParticipant,
            blockedByMe: blockStatus.blockedByMe,
            blockedMe: blockStatus.blockedMe,
            isBlocked: blockStatus.blockedByMe || blockStatus.blockedMe,
            unreadCount,
          };
        }),
      );

      // ✅ Remove null (non-mutual users)
      const filteredConversations = conversationsWithMeta.filter(Boolean);

      res.status(200).json({
        success: true,
        message: "Conversations fetched successfully",
        conversations: filteredConversations,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });
  router.get(
    "/conversations/:conversationId/messages",
    auth,
    async (req, res) => {
      try {
        const { conversationId } = req.params;
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 30;
        const skip = (page - 1) * limit;

        const currentUser = await getCurrentUser(req.user.id);
        if (!currentUser) {
          return res
            .status(404)
            .json({ success: false, message: "User not found" });
        }

        const conversation = await Conversation.findById(conversationId).lean();
        if (!conversation) {
          return res
            .status(404)
            .json({ success: false, message: "Conversation not found" });
        }

        const isParticipant = conversation.participants.some(
          (participantId) =>
            participantId.toString() === currentUser._id.toString(),
        );

        if (!isParticipant) {
          return res
            .status(403)
            .json({ success: false, message: "Not authorized" });
        }

        const totalMessages = await ChatMessage.countDocuments({
          conversation: conversationId,
        });

        const messages = await ChatMessage.find({
          conversation: conversationId,
        })
          .populate("sender", "userName email isOnline")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean();

        const orderedMessages = [...messages].reverse();

        await ChatMessage.updateMany(
          {
            conversation: conversationId,
            sender: { $ne: currentUser._id },
            seenBy: { $ne: currentUser._id },
          },
          {
            $addToSet: { seenBy: currentUser._id },
          },
        );

        const participantIds = conversation.participants
          .map((participantId) => participantId.toString())
          .filter((id) => id !== currentUser._id.toString());

        participantIds.forEach((participantId) => {
          User.findById(participantId)
            .then((participant) => {
              if (participant) {
                io.to(participant.userId.toString()).emit("chat:message:seen", {
                  conversationId,
                  seenBy: currentUser._id,
                  seenAt: new Date(),
                });
              }
            })
            .catch(() => {});
        });

        res.status(200).json({
          success: true,
          message: "Messages fetched successfully",
          messages: orderedMessages,
          nextPage: page + 1,
          totalPages: Math.ceil(totalMessages / limit),
        });
      } catch (err) {
        if (err?.code === 11000) {
          return res.status(200).json({
            success: true,
            message: "User is already blocked",
          });
        }
        console.error(err);
        res.status(500).json({ success: false, message: "Server error" });
      }
    },
  );

  router.put("/conversations/:conversationId/seen", auth, async (req, res) => {
    try {
      const { conversationId } = req.params;

      const currentUser = await getCurrentUser(req.user.id);
      if (!currentUser) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        return res
          .status(404)
          .json({ success: false, message: "Conversation not found" });
      }

      const isParticipant = conversation.participants.some(
        (participantId) =>
          participantId.toString() === currentUser._id.toString(),
      );

      if (!isParticipant) {
        return res
          .status(403)
          .json({ success: false, message: "Not authorized" });
      }

      await ChatMessage.updateMany(
        {
          conversation: conversationId,
          sender: { $ne: currentUser._id },
          seenBy: { $ne: currentUser._id },
        },
        {
          $addToSet: { seenBy: currentUser._id },
        },
      );

      const otherParticipants = conversation.participants.filter(
        (participantId) =>
          participantId.toString() !== currentUser._id.toString(),
      );

      const users = await User.find({ _id: { $in: otherParticipants } });

      users.forEach((user) => {
        io.to(user.userId.toString()).emit("chat:message:seen", {
          conversationId,
          seenBy: currentUser._id,
          seenAt: new Date(),
        });
      });

      res.status(200).json({
        success: true,
        message: "Messages marked as seen",
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  router.post("/blocks/:targetUserId", auth, async (req, res) => {
    try {
      const { targetUserId } = req.params;

      const currentUser = await getCurrentUser(req.user.id);
      if (!currentUser) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      const targetUser = await getUserByAnyId(targetUserId);
      if (!targetUser) {
        return res
          .status(404)
          .json({ success: false, message: "Target user not found" });
      }

      if (currentUser._id.toString() === targetUser._id.toString()) {
        return res
          .status(400)
          .json({ success: false, message: "You cannot block yourself" });
      }

      const existingBlock = await ChatBlock.findOne({
        blocker: currentUser._id,
        blocked: targetUser._id,
      });

      if (existingBlock) {
        return res.status(200).json({
          success: true,
          message: "User is already blocked",
          block: existingBlock,
        });
      }

      const block = await ChatBlock.create({
        blocker: currentUser._id,
        blocked: targetUser._id,
      });

      res.status(200).json({
        success: true,
        message: "User blocked successfully",
        block,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  router.delete("/blocks/:targetUserId", auth, async (req, res) => {
    try {
      const { targetUserId } = req.params;

      const currentUser = await getCurrentUser(req.user.id);
      if (!currentUser) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      const targetUser = await getUserByAnyId(targetUserId);
      if (!targetUser) {
        return res
          .status(404)
          .json({ success: false, message: "Target user not found" });
      }

      await ChatBlock.findOneAndDelete({
        blocker: currentUser._id,
        blocked: targetUser._id,
      });

      res.status(200).json({
        success: true,
        message: "User unblocked successfully",
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  router.get("/blocks", auth, async (req, res) => {
    try {
      const currentUser = await getCurrentUser(req.user.id);
      if (!currentUser) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      const blockedUsersRaw = await ChatBlock.find({ blocker: currentUser._id })
        .populate("blocked", "userName email isOnline lastSeen")
        .sort({ createdAt: -1 })
        .lean();

      const blockedUsers = blockedUsersRaw.filter((entry) => !!entry.blocked);

      res.status(200).json({
        success: true,
        message: "Blocked users fetched successfully",
        blockedUsers,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  router.delete("/messages/:messageId", auth, async (req, res) => {
    try {
      const { messageId } = req.params;

      const currentUser = await getCurrentUser(req.user.id);
      if (!currentUser) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      const message = await ChatMessage.findById(messageId);
      if (!message) {
        return res
          .status(404)
          .json({ success: false, message: "Message not found" });
      }

      if (message.sender.toString() !== currentUser._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "You can only delete your own messages",
        });
      }

      const conversation = await Conversation.findById(message.conversation);
      if (!conversation) {
        return res
          .status(404)
          .json({ success: false, message: "Conversation not found" });
      }

      await message.deleteOne();

      const latestMessage = await ChatMessage.findOne({
        conversation: conversation._id,
      }).sort({ createdAt: -1 });

      if (!latestMessage) {
        conversation.lastMessage = {
          text: "",
          image: null,
          type: "text",
          sender: null,
        };
        conversation.lastMessageAt = conversation.updatedAt || new Date();
      } else {
        conversation.lastMessage = {
          text: latestMessage.text,
          image: latestMessage.image,
          type: latestMessage.type,
          sender: latestMessage.sender,
        };
        conversation.lastMessageAt = latestMessage.createdAt;
      }

      await conversation.save();

      const participants = await User.find({
        _id: { $in: conversation.participants },
      }).select("userId");

      participants.forEach((participant) => {
        io.to(participant.userId.toString()).emit("chat:message:deleted", {
          conversationId: conversation._id,
          messageId,
          deletedBy: currentUser._id,
          deletedAt: new Date(),
        });
      });

      res.status(200).json({
        success: true,
        message: "Message deleted successfully",
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  return router;
};
