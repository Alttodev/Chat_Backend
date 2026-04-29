const express = require("express");
const router = express.Router();
const Post = require("../models/postCreate");
const auth = require("../middleware/auth");
const User = require("../models/userCreate");
const Notification = require("../models/notification");

const extractMentions = (text) => {
  const matches = text.match(/@([a-zA-Z0-9_.-]+)/g) || [];
  return [...new Set(matches.map((mention) => mention.slice(1).trim()))];
};

const buildMentionRegex = (username) => {
  const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}$`, "i");
};

module.exports = (io) => {
  //comment post
  router.post("/:id/comment", auth, async (req, res) => {
    try {
      const { comment } = req.body;

      if (!comment || comment.trim() === "") {
        return res.status(400).json({ message: "Comment text is required" });
      }

      const post = await Post.findById(req.params.id).populate(
        "user",
        "userName"
      );

      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      const user = await User.findOne({ userId: req.user.id });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const newComment = {
        user: user._id,
        post,
        comment,
      };

      post.comments.push(newComment);
      const addedComment = post.comments[post.comments.length - 1];
      await post.save();

      const populatedPost = await Post.findById(req.params.id).populate(
        "comments.user",
        "userName"
      );

      const sortedComments = [...populatedPost.comments].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
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
          })
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
            })
          )
        );

        notificationDocs.forEach((notificationDoc, index) => {
          const matchedUser = lookupResults.filter(Boolean)[index];

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
        });
      }

      res.status(201).json({
        success: true,
        message: "Comment added successfully",
        comments: sortedComments,
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

    const sortedComments = [...post.comments].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    const commentsWithEditable = sortedComments.map((comment) => ({
      _id: comment._id,
      comment: comment.comment,
      user: comment.user,
      createdAt: comment.createdAt,
      editable: comment.user._id.toString() === user._id.toString(),
    }));

    res.status(200).json({
      success: true,
      message: "Comments fetched successfully",
      comments: commentsWithEditable,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: "Server Error" });
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

      // find the comment
      const comment = post.comments.id(commentId);
      if (!comment) {
        return res
          .status(404)
          .json({ success: false, message: "Comment not found" });
      }

      // remove comment
      comment.deleteOne();
      await post.save();

      res.status(200).json({
        success: true,
        message: "Comment deleted successfully",
        comments: post.comments,
      });
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  return router;
};
