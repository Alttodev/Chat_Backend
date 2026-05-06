const express = require("express");
const router = express.Router();
const Post = require("../models/postCreate");
const auth = require("../middleware/auth");
const User = require("../models/userCreate");
const upload = require("../middleware/cloudinaryUpload");

const getLikeUserId = (like) => {
  if (!like) return null;
  if (typeof like === "object" && like.user) {
    return like.user.toString();
  }
  return like.toString();
};

const getLikeTimestamp = (like) => {
  if (!like || typeof like !== "object") {
    return null;
  }

  return like.likedAt ? new Date(like.likedAt) : null;
};

// Create Post
router.post("/create", auth, upload.single("image"), async (req, res) => {
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
      image: req.file ? req.file.path : null,
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
        message: "Not authorized to update this post",
      });
    }

    // update post text
    post.postText = req.body.postText || post.postText;

    await post.save();

    res.json({
      success: true,
      message: "Post updated successfully",
      post,
    });
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;

    const totalPosts = await Post.countDocuments();

    const posts = await Post.find()
      .populate("user", "userName email profileImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const currentUser = await User.findOne({ userId: req.user.id });

    if (!currentUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const currentUserId = currentUser._id.toString();
    const authUserId = req.user.id.toString();

    const postsWithExtra = posts.map((post) => {
      const likedByIds = post.likedBy.map(getLikeUserId);
      return {
        ...post.toObject(),
        likedByMe: likedByIds.some(
          (userId) => userId === currentUserId || userId === authUserId,
        ),
        isOwner:
          post.user && post.user._id.toString() === currentUser._id.toString(),
      };
    });

    res.status(200).json({
      success: true,
      message: "Posts fetched successfully",
      posts: postsWithExtra,
      nextPage: page + 1,
      totalPages: Math.ceil(totalPosts / limit),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/list/:id", auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;

    const userId = req.params.id;

    const totalPosts = await Post.countDocuments({ user: userId });

    const posts = await Post.find({ user: userId })
      .populate("user", "userName email address profileImage isOnline")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const currentUser = await User.findOne({ userId: req.user.id });

    if (!currentUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const currentUserId = currentUser._id.toString();
    const authUserId = req.user.id.toString();

    const userDetails = await User.findOne({ _id: userId });

    const postsWithExtra = posts.map((post) => {
      const { user, ...rest } = post.toObject();
      const likedByIds = post.likedBy.map(getLikeUserId);
      return {
        ...rest,
        likedByMe: likedByIds.some(
          (likedUserId) => likedUserId === currentUserId || likedUserId === authUserId,
        ),
        isOwner: user?._id.toString() === currentUser._id.toString(),
      };
    });

    const user = posts[0]?.user || null;
    const userDetail = user ? user : userDetails;
    res.status(200).json({
      success: true,
      message: "User's posts fetched successfully",
      userDetail,
      currentUser: {
        userName: currentUser.userName,
        profileImage: currentUser.profileImage,
      },
      posts: postsWithExtra,
      totalPosts: totalPosts,
      nextPage: page + 1,
      totalPages: Math.ceil(totalPosts / limit),
    });
  } catch (err) {
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

// get users who liked a post
router.get("/:id/liked-users", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).select("likedBy likes");

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    const likeRecords = post.likedBy
      .map((like) => ({
        userId: getLikeUserId(like),
        likedAt: getLikeTimestamp(like),
      }))
      .filter((like) => like.userId);

    const likedUserIds = likeRecords.map((like) => like.userId);

    const likedUsersDocs = await User.find({
      $or: [
        { _id: { $in: likedUserIds } },
        { userId: { $in: likedUserIds } },
      ],
    }).select("userName email profileImage address isOnline userId");

    const userLookup = new Map();
    likedUsersDocs.forEach((user) => {
      userLookup.set(user._id.toString(), user);
      userLookup.set(user.userId.toString(), user);
    });

    const likedUsers = likeRecords
      .map((like) => {
        const user = userLookup.get(like.userId.toString());
        if (!user) return null;

        return {
          id: user._id,
          userId: user.userId,
          userName: user.userName,
          email: user.email,
          profileImage: user.profileImage,
          address: user.address,
          isOnline: user.isOnline,
          likedAt: like.likedAt,
        };
      })
      .filter(Boolean);

    res.status(200).json({
      success: true,
      message: "Liked users fetched successfully",
      likedUsers,
      totalLikes: post.likes,
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

    const currentUser = await User.findOne({ userId: req.user.id });
    if (!currentUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const currentUserId = currentUser._id.toString();
    const authUserId = req.user.id.toString();
    const likedByIds = post.likedBy.map(getLikeUserId);
    let message = "";

    if (likedByIds.includes(currentUserId) || likedByIds.includes(authUserId)) {
      // Unlike
      post.likes -= 1;
      post.likedBy = post.likedBy.filter(
        (like) =>
          getLikeUserId(like) !== currentUserId &&
          getLikeUserId(like) !== authUserId,
      );
      message = "Unliked successfully";
    } else {
      // Like
      post.likes += 1;
      post.likedBy.push({
        user: currentUser._id,
        likedAt: new Date(),
      });
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
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
