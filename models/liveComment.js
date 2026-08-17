// models/liveComment.js
const mongoose = require("mongoose");

const liveCommentSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    username: { type: String, required: true },
    avatarUrl: { type: String, default: null },
    text: { type: String, required: true, maxlength: 200 },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.LiveComment ||
  mongoose.model("LiveComment", liveCommentSchema);