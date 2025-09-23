const express = require("express");
const router = express.Router();
const Post = require("../models/postCreate");
const auth = require("../middleware/auth");
const User = require("../models/userCreate");

// Create Post
router.post("/create", auth, async (req, res) => {
  try {
    const { postText } = req.body;

    const user = await User.findOne({ userId: req.user.id });
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const post = new Post({
      postText,
      user: user._id,
    });

    await post.save();

    res.status(201).json({
      success: true,
      message: "Post created successfully",
      post,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// update post
router.put("/update/:id", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const user = await User.findOne({ userId: req.user.id });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (post.user.toString() !== user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this post",
      });
    }
    post.postText = req.body.postText || post.postText;
    await post.save();

    res.json({ success: true, message: "Post updated successfully", post });
  } catch (err) {
    console.error("Error updating post:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// delete post

router.delete("/delete/:id", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    // Get the user document from DB
    const user = await User.findOne({ userId: req.user.id });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (post.user.toString() !== user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this post",
      });
    }

    await post.deleteOne();

    res
      .status(201)
      .json({ success: true, message: "Post deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

//list post
router.get("/list", auth, async (req, res) => {
  try {
    const posts = await Post.find()
      .populate("user", "userName")
      .sort({ createdAt: -1 });
    const user = await User.findOne({ userId: req.user.id });

    const postsWithLikedByMe = posts.map((post) => ({
      ...post.toObject(),
      likedByMe: post.likedBy.some(
        (userId) => userId.toString() === req.user.id
      ),
      isOwner: post.user && post.user._id.toString() === user._id.toString(),
    }));

    res.status(200).json({
      success: true,
      message: "Posts fetched successfully",
      posts: postsWithLikedByMe,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

//info
router.get("/info/:id", async (req, res) => {
  try {
    const postId = req.params.id;

    const post = await Post.findById(postId)
      .populate("user", "userName")
      .exec();

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Post fetched successfully",
      post,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

//like post
router.post("/:id/like", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    let message = "";

    if (post.likedBy.includes(req.user.id)) {
      // Unlike
      post.likes -= 1;
      post.likedBy = post.likedBy.filter((id) => id.toString() !== req.user.id);
      message = "Unliked successfully";
    } else {
      // Like
      post.likes += 1;
      post.likedBy.push(req.user.id);
      message = "Liked successfully";
    }

    await post.save();
    res.json({
      success: true,
      message,
      likes: post.likes,
      likedBy: post.likedBy,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

//comment

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

router.get("/:id/comments", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate("comments.user", "userName")
      .select("comments");

    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    res.status(200).json({
      success: true,
      message: "Comments fetched successfully",
      comments: post.comments,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

module.exports = router;
