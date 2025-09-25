const express = require("express");
const router = express.Router();
const Post = require("../models/postCreate");
const auth = require("../middleware/auth");
const User = require("../models/userCreate");

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
    const newComment = {
      user: user._id,
      post,
      comment,
    };

    post.comments.push(newComment);
    await post.save();

    const populatedPost = await Post.findById(req.params.id).populate(
      "comments.user",
      "userName"
    );

    res.status(201).json({
      success: true,
      message: "Comment added successfully",
      comments: populatedPost.comments,
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
      .populate("comments.user", "userName")
      .select("comments");

    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    const user = await User.findOne({ userId: req.user.id });

    const commentsWithEditable = post.comments.map((comment) => ({
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

module.exports = router;
