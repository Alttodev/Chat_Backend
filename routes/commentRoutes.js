const express = require("express");
const router = express.Router();
const Post = require("../models/postCreate");
const auth = require("../middleware/auth");
const User = require("../models/userCreate");
const Notification = require("../models/notification");
const { sendPushToUser } = require("../utils/pushNotifications");

const extractMentions = (text) => {
  const matches = text.match(/@([a-zA-Z0-9_.-]+)/g) || [];
  return [...new Set(matches.map((mention) => mention.slice(1).trim()))];
};

const buildMentionRegex = (username) => {
  const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}$`, "i");
};

const buildCommentTree = (comments, currentUserId) => {
  const commentMap = new Map();
  const rootComments = [];

  comments.forEach((comment) => {
    const reactions = Array.isArray(comment.reactions) ? comment.reactions : [];
    const likeCount = reactions.filter((reaction) => reaction.type === "like").length;
    const dislikeCount = reactions.filter(
      (reaction) => reaction.type === "dislike",
    ).length;
    const myReaction =
      reactions.find((reaction) => {
        const reactionUserId = reaction.user?._id?.toString() || reaction.user?.toString();
        return reactionUserId === currentUserId;
      })
        ?.type || null;

    commentMap.set(comment._id.toString(), {
      _id: comment._id,
      comment: comment.comment,
      user: comment.user,
      parentComment: comment.parentComment || null,
      createdAt: comment.createdAt,
      editable:
        comment.user?._id?.toString() === currentUserId ||
        comment.user?.toString() === currentUserId,
      likeCount,
      dislikeCount,
      myReaction,
      replies: [],
    });
  });

  comments.forEach((comment) => {
    const current = commentMap.get(comment._id.toString());
    const parentId = comment.parentComment?.toString();

    if (parentId && commentMap.has(parentId)) {
      commentMap.get(parentId).replies.push(current);
    } else {
      rootComments.push(current);
    }
  });

  const sortTree = (items) => {
    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    items.forEach((item) => sortTree(item.replies));
  };

  sortTree(rootComments);

  return rootComments;
};

const collectCommentBranchIds = (comments, rootCommentId) => {
  const idsToDelete = new Set();
  const stack = [rootCommentId.toString()];

  while (stack.length) {
    const currentId = stack.pop();
    if (idsToDelete.has(currentId)) {
      continue;
    }

    idsToDelete.add(currentId);

    comments.forEach((comment) => {
      const parentId = comment.parentComment?.toString();
      if (parentId === currentId) {
        stack.push(comment._id.toString());
      }
    });
  }

  return idsToDelete;
};

module.exports = (io) => {
  //comment post
  router.post("/:id/comment", auth, async (req, res) => {
    try {
      const { comment, parentCommentId } = req.body;

      if (!comment || comment.trim() === "") {
        return res.status(400).json({ message: "Comment text is required" });
      }

      const post = await Post.findById(req.params.id).populate(
        "user",
        "userName",
      );

      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      const user = await User.findOne({ userId: req.user.id });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      let parentComment = null;
      if (parentCommentId) {
        parentComment = post.comments.id(parentCommentId);
        if (!parentComment) {
          return res.status(404).json({ message: "Parent comment not found" });
        }
      }

      const newComment = {
        user: user._id,
        parentComment: parentComment ? parentComment._id : null,
        comment,
      };

      post.comments.push(newComment);
      const addedComment = post.comments[post.comments.length - 1];
      await post.save();

      const populatedPost = await Post.findById(req.params.id).populate(
        "comments.user",
        "userName",
      );

      const nestedComments = buildCommentTree(
        populatedPost.comments,
        user._id.toString(),
      );

      const mentionedUsernames = extractMentions(comment);
      const mentionedUsers = [];

      if (mentionedUsernames.length > 0) {
        const lookupResults = await Promise.all(
          mentionedUsernames.map(async (username) => {
            const matchedUser = await User.findOne({
              userName: buildMentionRegex(username),
            }).select("userId userName profileImage isOnline");

            if (!matchedUser) {
              return null;
            }

            if (matchedUser._id.toString() === user._id.toString()) {
              return null;
            }

            return matchedUser;
          }),
        );

        lookupResults.filter(Boolean).forEach((matchedUser) => {
          mentionedUsers.push(matchedUser);
        });

        const notificationDocs = await Promise.all(
          lookupResults.filter(Boolean).map((matchedUser) =>
            Notification.create({
              type: "comment-mention",
              from: user._id,
              to: matchedUser._id,
              post: post._id,
              commentId: addedComment?._id,
              comment,
            }),
          ),
        );

        const mentionRecipients = lookupResults.filter(Boolean);

        await Promise.all(
          notificationDocs.map(async (notificationDoc, index) => {
            const matchedUser = mentionRecipients[index];

            if (io) {
              io.to(matchedUser.userId.toString()).emit("new-notification", {
                type: "comment-mention",
                notificationId: notificationDoc._id,
                postId: post._id,
                commentId: addedComment?._id,
                from: {
                  id: user._id,
                  userId: user.userId,
                  userName: user.userName,
                  profileImage: user.profileImage,
                  isOnline: user.isOnline,
                },
                to: {
                  id: matchedUser._id,
                  userId: matchedUser.userId,
                  userName: matchedUser.userName,
                  profileImage: matchedUser.profileImage,
                  isOnline: matchedUser.isOnline,
                },
                comment,
                createdAt: notificationDoc.createdAt,
                message: `${user.userName} mentioned you in a comment`,
              });
            }

            return await sendPushToUser(matchedUser, {
              title: "Comment mention",
              body: `${user.userName} mentioned you in a comment`,
              data: {
                type: "comment-mention",
                notificationId: notificationDoc._id,
                postId: post._id,
                commentId: addedComment?._id,
                fromUserId: user.userId,
                fromName: user.userName,
              },
            });
          }),
        );
      }

      res.status(201).json({
        success: true,
        message: "Comment added successfully",
        comments: nestedComments,
        mentionedUsers,
      });
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ message: "Server Error" });
    }
  });

  //comment list

  router.get("/:id/comments", auth, async (req, res) => {
    try {
      const post = await Post.findById(req.params.id)
        .populate("comments.user", "userName profileImage")
        .select("comments");

      if (!post) {
        return res
          .status(404)
          .json({ success: false, message: "Post not found" });
      }

      const user = await User.findOne({ userId: req.user.id });
      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      const nestedComments = buildCommentTree(
        post.comments,
        user._id.toString(),
      );

      res.status(200).json({
        success: true,
        message: "Comments fetched successfully",
        comments: nestedComments,
      });
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ success: false, message: "Server Error" });
    }
  });

  router.post("/:postId/comment/:commentId/reaction", auth, async (req, res) => {
    try {
      const { postId, commentId } = req.params;
      const { type } = req.body;

      if (!["like", "dislike"].includes(type)) {
        return res.status(400).json({
          success: false,
          message: "Reaction type must be like or dislike",
        });
      }

      const post = await Post.findById(postId);
      if (!post) {
        return res
          .status(404)
          .json({ success: false, message: "Post not found" });
      }

      const user = await User.findOne({ userId: req.user.id });
      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      const comment = post.comments.id(commentId);
      if (!comment) {
        return res
          .status(404)
          .json({ success: false, message: "Comment not found" });
      }

      comment.reactions = Array.isArray(comment.reactions)
        ? comment.reactions
        : [];

      const existingIndex = comment.reactions.findIndex((reaction) => {
        const reactionUserId = reaction.user?._id?.toString() || reaction.user?.toString();
        return reactionUserId === user._id.toString();
      });

      if (existingIndex !== -1) {
        if (comment.reactions[existingIndex].type === type) {
          comment.reactions.splice(existingIndex, 1);
        } else {
          comment.reactions[existingIndex].type = type;
          comment.reactions[existingIndex].reactedAt = new Date();
        }
      } else {
        comment.reactions.push({
          user: user._id,
          type,
          reactedAt: new Date(),
        });
      }

      await post.save();

      const populatedPost = await Post.findById(postId).populate(
        "comments.user",
        "userName profileImage",
      );

      const nestedComments = buildCommentTree(
        populatedPost.comments,
        user._id.toString(),
      );

      return res.status(200).json({
        success: true,
        message: "Comment reaction updated successfully",
        comments: nestedComments,
      });
    } catch (err) {
      console.error(err.message);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  });

  //delete comment
  router.delete("/:postId/comment/:commentId", auth, async (req, res) => {
    try {
      const { postId, commentId } = req.params;

      const post = await Post.findById(postId);
      if (!post) {
        return res
          .status(404)
          .json({ success: false, message: "Post not found" });
      }

      const user = await User.findOne({ userId: req.user.id });
      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      // find the comment
      const comment = post.comments.id(commentId);
      if (!comment) {
        return res
          .status(404)
          .json({ success: false, message: "Comment not found" });
      }

      const idsToDelete = collectCommentBranchIds(post.comments, comment._id);
      post.comments = post.comments.filter(
        (item) => !idsToDelete.has(item._id.toString()),
      );
      await post.save();

      const populatedPost = await Post.findById(postId).populate(
        "comments.user",
        "userName profileImage",
      );

      const nestedComments = buildCommentTree(
        populatedPost.comments,
        user._id.toString(),
      );

      res.status(200).json({
        success: true,
        message: "Comment deleted successfully",
        comments: nestedComments,
      });
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  return router;
};
