const mongoose = require("mongoose");

const StatusSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    image: {
      type: String,
      required: true,
    },
    caption: {
      type: String,
      default: "",
      trim: true,
    },
    seenBy: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        seenAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  },
);

StatusSchema.index({ userId: 1, createdAt: -1 });
StatusSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

module.exports = mongoose.model("status", StatusSchema);
