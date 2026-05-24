const express = require("express");
const FollowRequest = require("../models/followRequest");
const User = require("../models/userCreate");
const auth = require("../middleware/auth");
const { sendPushToUser } = require("../utils/pushNotifications");

module.exports = (io) => {
  const router = express.Router();

  const relationFields =
    "userName email address profileImage isOnline isVerified userId";

  const formatUser = (user) => {
    if (!user) return null;

    return {
      id: user._id,
      userId: user.userId,
      userName: user.userName,
      email: user.email,
      address: user.address,
      profileImage: user.profileImage,
      isOnline: user.isOnline,
      isVerified: user.isVerified,
    };
  };

  router.post("/send/:id", auth, async (req, res) => {
    try {
      const user = await User.findOne({ userId: req.user.id });
      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      const toUser = await User.findById(req.params.id);
      if (!toUser) {
        return res
          .status(404)
          .json({ success: false, message: "Target user not found" });
      }

      const request = new FollowRequest({
        from: user._id,
        to: toUser._id,
      });
      await request.save();

      io.to(toUser.userId.toString()).emit("new-notification", {
        type: "follow-request",
        followRequestId: request._id,
        from: {
          id: user._id,
          userId: user.userId,
          userName: user.userName,
          profileImage: user.profileImage,
          isOnline: user.isOnline,
        },
        to: {
          id: toUser._id,
          userId: toUser.userId,
          userName: toUser.userName,
          profileImage: toUser.profileImage,
          isOnline: toUser.isOnline,
        },
        createdAt: request.createdAt,
        message: "New follow request received",
      });

      await sendPushToUser(toUser, {
        title: "Follow request",
        body: `${user.userName} sent you a follow request`,
        data: {
          type: "follow-request",
          followRequestId: request._id,
          fromUserId: user.userId,
          fromName: user.userName,
        },
      });

      res.status(201).json({
        success: true,
        message: "Follow request sent successfully",
        request,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  router.put("/:id/respond", auth, async (req, res) => {
    try {
      const { action } = req.body;

      const request = await FollowRequest.findById(req.params.id)
        .populate("from")
        .populate("to");

      if (!request) {
        return res
          .status(404)
          .json({ success: false, message: "Request not found" });
      }

      const user = await User.findOne({ userId: req.user.id });

      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      if (request.to._id.toString() !== user._id.toString()) {
        return res
          .status(403)
          .json({ success: false, message: "Not authorized" });
      }

      request.isDeleted = true;

      if (action === "accept") {
        request.status = "accepted";
        request.isFriends = true;
      } else if (action === "decline") {
        request.status = "declined";
      }

      await request.save();

      io.to(request.from.userId.toString()).emit("new-notification", {
        type: "follow-response",
        followRequestId: request._id,
        from: {
          id: request.from._id,
          userId: request.from.userId,
          userName: request.from.userName,
          profileImage: request.from.profileImage,
          isOnline: request.from.isOnline,
        },
        to: {
          id: request.to._id,
          userId: request.to.userId,
          userName: request.to.userName,
          profileImage: request.to.profileImage,
          isOnline: request.to.isOnline,
        },
        status: request.status,
        createdAt: request.updatedAt,
        message: `Your follow request was ${request.status}`,
      });

      await sendPushToUser(request.from, {
        title: "Follow request update",
        body: `Your follow request was ${request.status}`,
        data: {
          type: "follow-response",
          followRequestId: request._id,
          status: request.status,
          toUserId: request.to.userId,
          toName: request.to.userName,
        },
      });

      res.json({
        success: true,
        message: `Follow request ${request.status}`,
        request,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  router.get("/requests", auth, async (req, res) => {
    try {
      const user = await User.findOne({ userId: req.user.id });

      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      const requests = await FollowRequest.find({ to: user._id })
        .populate("from", "userName email address profileImage isVerified")
        .populate("to", "userName email address")
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        count: requests.length,
        requests,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  router.get("/requests/:fromId/:toId", auth, async (req, res) => {
    try {
      const { fromId, toId } = req.params;

      const request = await FollowRequest.findOne({ from: fromId, to: toId });

      // if (!request) {
      //   return res
      //     .status(404)
      //     .json({ success: false, message: "No request found between users" });
      // }

      res.json({ success: true, request });
    } catch (err) {
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  router.delete("/delete/requests/:fromId/:toId", auth, async (req, res) => {
    try {
      const { fromId, toId } = req.params;

      const request = await FollowRequest.findOne({ from: fromId, to: toId });

      if (!request) {
        return res
          .status(404)
          .json({ success: false, message: "No request found between users" });
      }

      await request.deleteOne();

      res
        .status(201)
        .json({ success: true, message: "Unfollowed successfully" });
    } catch (err) {
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  router.get("/connections/recommended", auth, async (req, res) => {
    try {
      const currentUser = await User.findOne({ userId: req.user.id });

      if (!currentUser) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      const [outgoingFriends, incomingFriends] = await Promise.all([
        FollowRequest.find({
          from: currentUser._id,
          status: "accepted",
          isFriends: true,
        }).populate("to", relationFields),
        FollowRequest.find({
          to: currentUser._id,
          status: "accepted",
          isFriends: true,
        }).populate("from", relationFields),
      ]);

      const currentUserId = currentUser._id.toString();

      const outgoingIds = new Set(
        outgoingFriends
          .map((request) => request.to?._id?.toString())
          .filter(Boolean),
      );

      const incomingIds = new Set(
        incomingFriends
          .map((request) => request.from?._id?.toString())
          .filter(Boolean),
      );

      const mutualFriendIds = new Set(
        [...outgoingIds].filter((userId) => incomingIds.has(userId)),
      );

      const mutualFriends = outgoingFriends
        .filter((request) => {
          const targetId = request.to?._id?.toString();
          return targetId && mutualFriendIds.has(targetId);
        })
        .map((request) => formatUser(request.to))
        .filter(Boolean);

      const sourceFriendIds = [...new Set([...outgoingIds, ...incomingIds])];

      const currentUserRelations = await FollowRequest.find({
        from: currentUser._id,
        status: { $ne: "declined" },
      }).select("to");

      const currentUserFollowingIds = new Set(
        currentUserRelations
          .map((request) => request.to?.toString())
          .filter(Boolean),
      );

      const unfollowedUsers = await User.find({
        _id: {
          $nin: [currentUser._id, ...Array.from(currentUserFollowingIds)],
        },
      }).select(relationFields);

      const buildCommonSuggestions = () => {
        return unfollowedUsers
          .map((user) => {
            const userSummary = formatUser(user);
            if (!userSummary) return null;

            return {
              ...userSummary,
              canAdd: true,
              suggestedByFriends: [],
              suggestedByFriendNames: [],
              mutualFriendCount: 0,
            };
          })
          .filter(Boolean)
          .sort((a, b) => (a.userName || "").localeCompare(b.userName || ""));
      };

      if (sourceFriendIds.length === 0) {
        const commonSuggestions = buildCommonSuggestions();

        return res.json({
          success: true,
          message: "Recommended connections listed successfully",
          count: commonSuggestions.length,
          mutualFriends: [],
          sourceFriendCount: 0,
          suggestions: commonSuggestions,
          commonSuggestions,
        });
      }

      const friendFollowings = await FollowRequest.find({
        from: { $in: sourceFriendIds },
        status: { $ne: "declined" },
      })
        .populate("from", relationFields)
        .populate("to", relationFields);

      const alreadyConnectedIds = new Set([
        ...outgoingIds,
        ...incomingIds,
        currentUserId,
      ]);

      const suggestionsMap = new Map();

      friendFollowings.forEach((request) => {
        const target = request.to;
        const friend = request.from;

        if (!target || !friend) return;

        const targetId = target._id.toString();

        if (alreadyConnectedIds.has(targetId)) return;
        if (mutualFriendIds.has(targetId)) return;
        if (currentUserFollowingIds.has(targetId)) return;

        const existing = suggestionsMap.get(targetId);

        const friendSummary = formatUser(friend);
        const targetSummary = formatUser(target);

        if (!friendSummary || !targetSummary) return;

        if (!existing) {
          suggestionsMap.set(targetId, {
            ...targetSummary,
            canAdd: true,
            suggestedByFriends: [friendSummary],
            suggestedByFriendNames: friendSummary?.userName
              ? [friendSummary.userName]
              : [],
          });
          return;
        }

        const friendAlreadyAdded = existing.suggestedByFriends.some(
          (item) => item.id?.toString() === friendSummary?.id?.toString(),
        );

        if (!friendAlreadyAdded && friendSummary) {
          existing.suggestedByFriends.push(friendSummary);
          if (friendSummary.userName) {
            existing.suggestedByFriendNames.push(friendSummary.userName);
          }
        }
      });

      const suggestions = Array.from(suggestionsMap.values())
        .map((item) => ({
          ...item,
          mutualFriendCount: item.suggestedByFriends.length,
        }))
        .sort(
          (a, b) =>
            b.mutualFriendCount - a.mutualFriendCount ||
            (a.userName || "").localeCompare(b.userName || ""),
        );

      const commonSuggestions = unfollowedUsers
        .map((user) => {
          const userSummary = formatUser(user);
          if (!userSummary) return null;

          const existingSuggestion = suggestionsMap.get(user._id.toString());

          return {
            ...userSummary,
            canAdd: true,
            suggestedByFriends: existingSuggestion?.suggestedByFriends || [],
            suggestedByFriendNames:
              existingSuggestion?.suggestedByFriendNames || [],
            mutualFriendCount:
              existingSuggestion?.suggestedByFriends?.length || 0,
          };
        })
        .filter(Boolean)
        .sort(
          (a, b) =>
            b.mutualFriendCount - a.mutualFriendCount ||
            (a.userName || "").localeCompare(b.userName || ""),
        );

      return res.json({
        success: true,
        message: "Recommended connections listed successfully",
        count: suggestions.length,
        mutualFriends,
        sourceFriendCount: sourceFriendIds.length,
        suggestions,
        commonSuggestions,
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: "Server error" });
    }
  });

  router.get("/friends", auth, async (req, res) => {
    try {
      const user = await User.findOne({ userId: req.user.id });

      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      const friends = await FollowRequest.find({ to: user._id })
        .populate(
          "from",
          "userName email address profileImage isOnline isVerified",
        )
        .populate("to", "userName email address isOnline")
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        count: friends.length,
        friends,
        message: "Friends Listed Successfully",
      });
    } catch (err) {
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  router.get("/friends/:id", auth, async (req, res) => {
    const id = req.params.id;
    try {
      const user = await User.findOne({ _id: id });

      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      const friends = await FollowRequest.find({ to: user._id })
        .populate(
          "from",
          "userName email address profileImage isOnline isVerified",
        )
        .populate("to", "userName email address isOnline")
        .sort({ createdAt: -1 });

      const totalFollowers = friends.filter((f) => f.status === "accepted");

      res.json({
        success: true,
        totalFollowers,
        message: "Friends Listed Successfully",
      });
    } catch (err) {
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  router.get("/friends/following/:id", auth, async (req, res) => {
    const id = req.params.id;

    try {
      const user = await User.findOne({ _id: id });

      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      const following = await FollowRequest.find({
        from: user._id,
        status: "accepted",
      })
        .populate(
          "to",
          "userName email address profileImage isOnline isVerified",
        )
        .populate("from", "userName email address isOnline")
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        totalFollowing: following,
        message: "Following Listed Successfully",
      });
    } catch (err) {
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  router.get("/counts", auth, async (req, res) => {
    try {
      const user = await User.findOne({ userId: req.user.id });

      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      const friends = await FollowRequest.find({ to: user._id })
        .populate("from", "userName email address isOnline")
        .populate("to", "userName email address isOnline")
        .sort({ createdAt: -1 });
      const following = await FollowRequest.find({ from: user._id });
      // --- counts ---
      const totalFriends = friends.filter(
        (f) => f.status === "accepted",
      ).length;
      const totalRequests = friends.filter(
        (f) => f.status === "pending",
      ).length;
      const totalOnline = friends.filter(
        (f) => f.status === "accepted" && f.from.isOnline === true,
      ).length;
      const totalFollowing = following.filter(
        (f) => f.status === "accepted",
      ).length;

      res.json({
        success: true,
        message: "Count Listed Successfully",
        totalFriends,
        totalRequests,
        totalOnline,
        totalFollowing,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  router.get("/counts/:id", auth, async (req, res) => {
    try {
      const user = await User.findById(req.params.id);

      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      const friends = await FollowRequest.find({ to: user._id })
        .populate("from", "userName email address isOnline")
        .populate("to", "userName email address isOnline")
        .sort({ createdAt: -1 });
      const following = await FollowRequest.find({ from: user._id });
      // --- counts ---
      const totalFriends = friends.filter(
        (f) => f.status === "accepted",
      ).length;
      const totalRequests = friends.filter(
        (f) => f.status === "pending",
      ).length;
      const totalOnline = friends.filter(
        (f) => f.status === "accepted" && f.from.isOnline === true,
      ).length;

      const totalFollowing = following.filter(
        (f) => f.status === "accepted",
      ).length;

      res.json({
        success: true,
        message: "Count Listed Successfully",
        totalFriends,
        totalRequests,
        totalOnline,
        totalFollowing,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  return router;
};
