const mongoose = require("mongoose");

const ChatMessageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    text: {
      type: String,
      default: "",
      trim: true,
    },
    image: {
      type: String,
      default: null,
    },
    type: {
      type: String,
      enum: ["text", "image", "mixed"],
      required: true,
    },
    seenBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
      },
    ],
  },
  { timestamps: true }
);

ChatMessageSchema.index({ conversation: 1, createdAt: -1 });

module.exports = mongoose.model("ChatMessage", ChatMessageSchema);
