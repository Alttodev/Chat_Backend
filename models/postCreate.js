const mongoose = require("mongoose");

const CommentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
  },
  reactions: {
    type: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "user",
          required: true,
        },
        type: {
          type: String,
          enum: ["like", "dislike"],
          required: true,
        },
        reactedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    default: [],
  },
  parentComment: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },
  comment: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const LikeSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
  },

  type: {
    type: String,
    enum: ["love","fire","clap", "haha", "wow", "sad"],
    default: "love",
  },

  likedAt: {
    type: Date,
    default: Date.now,
  },
});

const PostSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
  },

  postText: {
    type: String,
    required: true,
  },

  image: {
    type: String,
  },

  likes: {
    type: Number,
    default: 0,
  },

  likedBy: {
    type: [LikeSchema],
    default: [],
  },

  comments: [CommentSchema],

  createdAt: {
    type: Date,
    default: Date.now,
  },

  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

PostSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("post", PostSchema);
