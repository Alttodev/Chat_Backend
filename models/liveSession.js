const mongoose = require("mongoose");

const liveSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true, 
    },
    roomName: { type: String, required: true },
    startedAt: { type: Date, default: Date.now },
    viewerCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);
module.exports =
  mongoose.models.LiveSession ||
  mongoose.model("LiveSession", liveSessionSchema);