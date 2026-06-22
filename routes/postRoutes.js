const express = require("express");
const router = express.Router();
const Post = require("../models/postCreate");
const auth = require("../middleware/auth");
const User = require("../models/userCreate");
const FollowRequest = require("../models/followRequest");
const {
  mediaUpload,
  ensureVideoDuration,
} = require("../middleware/cloudinaryUpload");

const getLikeUserId = (item) => {
  if (!item) return null;

  if (typeof item === "string") return item;

  return item.user || null;
};
const getLikeTimestamp = (like) => {
  if (!like || typeof like !== "object") {
    return null;
  }

  return like.likedAt ? new Date(like.likedAt) : null;
};

const buildLikedUsers = async (likedBy = []) => {
  const likeRecords = (Array.isArray(likedBy) ? likedBy : [])
    .map((like) => ({
      userId: getLikeUserId(like),
      likedAt: getLikeTimestamp(like),
      type: like?.type || "like",
    }))
    .filter((like) => like.userId);

  if (!likeRecords.length) return [];

  const likedUserIds = likeRecords.map((like) => like.userId);

  const users = await User.find({
    $or: [{ _id: { $in: likedUserIds } }, { userId: { $in: likedUserIds } }],
  }).select("userName profileImage userId isVerified");

  const userLookup = new Map();
  users.forEach((user) => {
    userLookup.set(user._id.toString(), user);
    userLookup.set(user.userId.toString(), user);
  });

  return likeRecords
    .map((like) => {
      const user = userLookup.get(String(like.userId));
      if (!user) return null;

      return {
        id: user._id,
        userId: user.userId,
        userName: user.userName,
        profileImage: user.profileImage,
        isVerified: user.isVerified,
        likedAt: like.likedAt,
        type: like.type,
      };
    })
    .filter(Boolean);
};

const getBookmarkUserId = (item) => {
  if (!item) return null;

  if (typeof item === "string") return item;

  return item.user || null;
};

const getBookmarkTimestamp = (bookmark) => {
  if (!bookmark || typeof bookmark !== "object") {
    return null;
  }

  return bookmark.bookmarkedAt ? new Date(bookmark.bookmarkedAt) : null;
};

const buildPostExtras = (post, currentUserId, authUserId, likedUsers = []) => {
  const likedByIds = (Array.isArray(post.likedBy) ? post.likedBy : [])
    .map(getLikeUserId)
    .filter(Boolean);

  const bookmarkedRecords = Array.isArray(post.bookmarkedBy)
    ? post.bookmarkedBy
    : [];
  const bookmarkedByIds = bookmarkedRecords
    .map(getBookmarkUserId)
    .filter(Boolean);

  const myReactionData = (Array.isArray(post.likedBy) ? post.likedBy : []).find(
    (item) => {
      const userId = getLikeUserId(item);
      return (
        userId?.toString() === currentUserId ||
        userId?.toString() === authUserId
      );
    },
  );

  const myBookmarkData = bookmarkedRecords.find((item) => {
    const userId = getBookmarkUserId(item);
    return (
      userId?.toString() === currentUserId || userId?.toString() === authUserId
    );
  });

  const postData = typeof post.toObject === "function" ? post.toObject() : post;

  return {
    ...postData,
    likedByUsers: likedUsers,
    likedByMe: likedByIds.some(
      (userId) =>
        userId?.toString() === currentUserId ||
        userId?.toString() === authUserId,
    ),
    bookmarkedByMe: bookmarkedByIds.some(
      (userId) =>
        userId?.toString() === currentUserId ||
        userId?.toString() === authUserId,
    ),
    bookmarkedAt: getBookmarkTimestamp(myBookmarkData),
    bookmarks: bookmarkedRecords.length,
    myReaction: myReactionData ? "like" : null,
    isOwner: post.user && post.user._id.toString() === currentUserId,
  };
};

// Create Post
router.post(
  "/create",
  auth,
  mediaUpload.array("image", 5),
  async (req, res) => {
    try {
      const { postText = "" } = req.body;

      const hashtags =
        postText
          .match(/#(\w+)/g)
          ?.map((tag) => tag.replace("#", "").toLowerCase()) || [];

      await ensureVideoDuration(req.file, 60);

      const user = await User.findOne({ userId: req.user.id });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const mediaUrls = req.files?.map((file) => file.path) || [];

      const post = new Post({
        postText,
        user: user._id,
        image: mediaUrls,
        hashtags,
      });

      await post.save();

      res.status(201).json({
        success: true,
        message: "Post created successfully",
        post,
      });
    } catch (err) {
      if (err?.statusCode) {
        return res.status(err.statusCode).json({
          success: false,
          message: err.message,
        });
      }

      res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  },
);

// update post
router.put("/update/:id", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    const user = await User.findOne({ userId: req.user.id });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (post.user.toString() !== user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this post",
      });
    }

    const postText = req.body.postText || post.postText;

    const hashtags =
      postText
        ?.match(/#(\w+)/g)
        ?.map((tag) => tag.replace("#", "").toLowerCase()) || [];

    post.postText = postText;
    post.hashtags = hashtags;

    await post.save();

    res.json({
      success: true,
      message: "Post updated successfully",
      post,
    });
  } catch (err) {
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

    const currentUser = await User.findOne({ userId: req.user.id });

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const currentUserId = currentUser._id.toString();
    const authUserId = req.user.id.toString();

    const publicUsers = await User.find({ isPublic: true }).select("_id");
    const publicUserIds = publicUsers.map((user) => user._id.toString());

    const relations = await FollowRequest.find({
      status: "accepted",
      isFriends: true,
      isDeleted: true,
      from: currentUser._id,
    }).select("to");

    const relatedUserIds = relations
      .map((item) => item.to?.toString())
      .filter(Boolean);

    const allowedUserIds = [
      ...new Set([...publicUserIds, ...relatedUserIds, currentUserId]),
    ];

    const totalPosts = await Post.countDocuments({
      user: { $in: allowedUserIds },
    });

    const posts = await Post.find({
      user: { $in: allowedUserIds },
    })
      .populate("user", "userName email profileImage isVerified isPublic")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const likedUsersByPost = await Promise.all(
      posts.map((post) => buildLikedUsers(post.likedBy)),
    );

    const postsWithExtra = posts.map((post, index) =>
      buildPostExtras(post, currentUserId, authUserId, likedUsersByPost[index]),
    );

    return res.status(200).json({
      success: true,
      message: "Posts fetched successfully",
      posts: postsWithExtra,
      nextPage: page + 1,
      totalPages: Math.ceil(totalPosts / limit),
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

router.get("/videos", auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;

    const skip = (page - 1) * limit;

    const currentUser = await User.findOne({
      userId: req.user.id,
    });

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const currentUserId = currentUser._id.toString();
    const authUserId = req.user.id.toString();

    const publicUsers = await User.find({
      isPublic: true,
    }).select("_id");

    const publicUserIds = publicUsers.map((user) => user._id.toString());

    const relations = await FollowRequest.find({
      status: "accepted",
      isFriends: true,
      isDeleted: true,
      from: currentUser._id,
    }).select("to");

    const relatedUserIds = relations
      .map((item) => item.to?.toString())
      .filter(Boolean);

    const allowedUserIds = [
      ...new Set([...publicUserIds, ...relatedUserIds, currentUserId]),
    ];

    const videoFilter = {
      user: { $in: allowedUserIds },
      image: {
        $regex: /\.(mp4|mov|webm|mkv|avi)$/i,
      },
    };

    const totalPosts = await Post.countDocuments(videoFilter);

    const posts = await Post.find(videoFilter)
      .populate("user", "userName email profileImage isVerified isPublic")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const likedUsersByPost = await Promise.all(
      posts.map((post) => buildLikedUsers(post.likedBy)),
    );

    const postsWithExtra = posts.map((post, index) =>
      buildPostExtras(post, currentUserId, authUserId, likedUsersByPost[index]),
    );

    return res.status(200).json({
      success: true,
      message: "Video posts fetched successfully",
      posts: postsWithExtra,
      currentPage: page,
      totalPages: Math.ceil(totalPosts / limit),
      totalPosts,
      limit,
      hasMore: page < Math.ceil(totalPosts / limit),
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

//Hashtag Route

router.get("/hashtags/:tag", auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;

    const tag = String(req.params.tag || "")
      .toLowerCase()
      .trim();
    if (!tag) {
      return res.status(400).json({
        success: false,
        message: "Hashtag is required",
      });
    }

    const currentUser = await User.findOne({ userId: req.user.id });
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const currentUserId = currentUser._id.toString();
    const authUserId = req.user.id.toString();

    const publicUsers = await User.find({ isPublic: true }).select("_id");
    const publicUserIds = publicUsers.map((user) => user._id.toString());

    const relations = await FollowRequest.find({
      status: "accepted",
      isFriends: true,
      isDeleted: true,
      from: currentUser._id,
    }).select("to");

    const relatedUserIds = relations
      .map((item) => item.to?.toString())
      .filter(Boolean);

    const allowedUserIds = [
      ...new Set([...publicUserIds, ...relatedUserIds, currentUserId]),
    ];

    const postFilter = {
      user: { $in: allowedUserIds },
      hashtags: tag,
    };

    const totalPosts = await Post.countDocuments(postFilter);

    const posts = await Post.find(postFilter)
      .populate("user", "userName email profileImage isVerified isPublic")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const likedUsersByPost = await Promise.all(
      posts.map((post) => buildLikedUsers(post.likedBy)),
    );

    const postsWithExtra = posts.map((post, index) =>
      buildPostExtras(post, currentUserId, authUserId, likedUsersByPost[index]),
    );

    return res.status(200).json({
      success: true,
      message: "Hashtag posts fetched successfully",
      tag,
      posts: postsWithExtra,
      nextPage: page + 1,
      totalPages: Math.ceil(totalPosts / limit),
      totalPosts,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
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
      .populate(
        "user",
        "userName email address profileImage isOnline isVerified  isPublic bio",
      )
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
    const likedUsersByPost = await Promise.all(
      posts.map((post) => buildLikedUsers(post.likedBy)),
    );

    const userDetails = await User.findOne({ _id: userId });

    const postsWithExtra = posts.map((post, index) =>
      buildPostExtras(post, currentUserId, authUserId, likedUsersByPost[index]),
    );

    const user = posts[0]?.user || null;
    const userDetail = user ? user : userDetails;
    res.status(200).json({
      success: true,
      message: "User's posts fetched successfully",
      userDetail,
      currentUser: {
        userName: currentUser.userName,
        profileImage: currentUser.profileImage,
        id: currentUser?._id,
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

router.post("/:id/bookmark", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    const currentUser = await User.findOne({ userId: req.user.id });
    if (!currentUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const currentUserId = currentUser._id.toString();

    post.bookmarkedBy = Array.isArray(post.bookmarkedBy)
      ? post.bookmarkedBy.filter((item) => item?.user)
      : [];

    const existingIndex = post.bookmarkedBy.findIndex(
      (item) => String(item.user) === currentUserId,
    );

    let bookmarkedByMe = true;

    if (existingIndex !== -1) {
      post.bookmarkedBy.splice(existingIndex, 1);
      bookmarkedByMe = false;
    } else {
      post.bookmarkedBy.push({
        user: currentUser._id,
        bookmarkedAt: new Date(),
      });
    }

    post.bookmarks = post.bookmarkedBy.length;

    await post.save();

    return res.json({
      success: true,
      bookmarkedByMe,
      bookmarks: post.bookmarks,
      bookmarkedBy: post.bookmarkedBy,
    });
  } catch (err) {
    console.error("BOOKMARK ERROR:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Server error",
    });
  }
});

router.get("/bookmarked", auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const currentUser = await User.findOne({ userId: req.user.id });
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const currentUserId = currentUser._id.toString();
    const authUserId = req.user.id.toString();

    const bookmarkQuery = {
      bookmarkedBy: {
        $elemMatch: {
          user: currentUser._id,
        },
      },
    };

    const totalPosts = await Post.countDocuments(bookmarkQuery);

    const posts = await Post.find(bookmarkQuery)
      .populate("user", "userName email profileImage isVerified isPublic")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const likedUsersByPost = await Promise.all(
      posts.map((post) => buildLikedUsers(post.likedBy)),
    );

    const postsWithExtra = posts.map((post, index) =>
      buildPostExtras(post, currentUserId, authUserId, likedUsersByPost[index]),
    );

    return res.status(200).json({
      success: true,
      message: "Bookmarked posts fetched successfully",
      posts: postsWithExtra,
      currentPage: page,
      totalPages: Math.ceil(totalPosts / limit),
      totalPosts,
      limit,
      hasMore: page < Math.ceil(totalPosts / limit),
    });
  } catch (err) {
    return res.status(500).json({
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

    const likeRecords = (Array.isArray(post.likedBy) ? post.likedBy : [])
      .map((like) => ({
        userId: getLikeUserId(like),
        likedAt: getLikeTimestamp(like),
        type: "like",
      }))
      .filter((like) => like.userId);

    const likedUserIds = likeRecords.map((like) => like.userId);

    const likedUsersDocs = await User.find({
      $or: [{ _id: { $in: likedUserIds } }, { userId: { $in: likedUserIds } }],
    }).select("userName email profileImage address isOnline isVerified userId");

    const userLookup = new Map();
    likedUsersDocs.forEach((user) => {
      userLookup.set(user._id.toString(), user);
      userLookup.set(user.userId.toString(), user);
    });

    const likedUsers = likeRecords
      .map((like) => {
        const user = userLookup.get(String(like.userId));
        if (!user) return null;

        return {
          id: user._id,
          userId: user.userId,
          userName: user.userName,
          email: user.email,
          profileImage: user.profileImage,
          address: user.address,
          isOnline: user.isOnline,
          isVerified: user.isVerified,
          likedAt: like.likedAt,
          type: like.type,
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

    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    const currentUser = await User.findOne({ userId: req.user.id });
    if (!currentUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const currentUserId = currentUser._id.toString();

    // add this here
    post.likedBy = Array.isArray(post.likedBy)
      ? post.likedBy.filter((item) => item?.user)
      : [];

    const existingIndex = post.likedBy.findIndex(
      (item) => String(item.user) === currentUserId,
    );

    if (existingIndex !== -1) {
      post.likedBy.splice(existingIndex, 1);
    } else {
      post.likedBy.push({
        user: currentUser._id,
        type: "like",
        likedAt: new Date(),
      });
    }

    post.likes = post.likedBy.length;

    await post.save();

    return res.json({
      success: true,
      likes: post.likes,
      likedBy: post.likedBy,
      myReaction: post.likedBy.find(
        (item) => String(item.user) === currentUserId,
      )
        ? "like"
        : null,
    });
  } catch (err) {
    console.error("LIKE ERROR:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Server error",
    });
  }
});

router.get("/trending", auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    // Trending window: last 30 days
    const windowDays = 30;
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - windowDays);

    // Minimum likes to qualify as "trending" — tune this to your user base size
    const minLikes = 1;

    const currentUser = await User.findOne({ userId: req.user.id });
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const currentUserId = currentUser._id.toString();
    const authUserId = req.user.id.toString();

    const basePipeline = [
      { $match: { createdAt: { $gte: windowStart } } },
      {
        $addFields: {
          likeCount: {
            $size: {
              $filter: {
                input: { $ifNull: ["$likedBy", []] },
                as: "reaction",
                cond: { $eq: ["$$reaction.type", "like"] },
              },
            },
          },
        },
      },
      { $match: { likeCount: { $gte: minLikes } } },
    ];

    const countResult = await Post.aggregate([
      ...basePipeline,
      { $count: "total" },
    ]);
    const totalPosts = countResult[0]?.total || 0;

    const posts = await Post.aggregate([
      ...basePipeline,
      { $sort: { likeCount: -1, createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
    ]);

    const populatedPosts = await Post.populate(posts, {
      path: "user",
      select: "userName email profileImage isVerified isPublic",
    });

    const likedUsersByPost = await Promise.all(
      populatedPosts.map((post) => buildLikedUsers(post.likedBy)),
    );

    const postsWithExtra = populatedPosts.map((post, index) =>
      buildPostExtras(post, currentUserId, authUserId, likedUsersByPost[index]),
    );

    return res.status(200).json({
      success: true,
      message: "Trending posts fetched successfully",
      posts: postsWithExtra,
      currentPage: page,
      totalPages: Math.ceil(totalPosts / limit),
      totalPosts,
      limit,
      hasMore: page < Math.ceil(totalPosts / limit),
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

module.exports = router;
