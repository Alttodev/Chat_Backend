const mongoose = require("mongoose");

const profileViewSchema = new mongoose.Schema(
  {
    viewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    viewedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    viewedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

profileViewSchema.index({ viewer: 1, viewedUser: 1 }, { unique: true });

module.exports = mongoose.model("ProfileView", profileViewSchema);