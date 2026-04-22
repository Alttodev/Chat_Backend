const mongoose = require("mongoose");

const ConversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true,
      },
    ],
    lastMessage: {
      text: { type: String, default: "" },
      image: { type: String, default: null },
      type: {
        type: String,
        enum: ["text", "image", "mixed"],
        default: "text",
      },
      sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
      },
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ lastMessageAt: -1 });

module.exports = mongoose.model("Conversation", ConversationSchema);
