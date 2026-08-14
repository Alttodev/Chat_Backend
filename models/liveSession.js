
const mongoose = require("mongoose");

const liveSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      unique: true, // one active session per user
    },
    roomName: { type: String, required: true },
    startedAt: { type: Date, default: Date.now },
    viewerCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("LiveSession", liveSessionSchema);