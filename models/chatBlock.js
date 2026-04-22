const mongoose = require("mongoose");

const ChatBlockSchema = new mongoose.Schema(
  {
    blocker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    blocked: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

ChatBlockSchema.index({ blocker: 1, blocked: 1 }, { unique: true });

module.exports = mongoose.model("ChatBlock", ChatBlockSchema);
