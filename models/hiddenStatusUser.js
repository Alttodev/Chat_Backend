const mongoose = require("mongoose");

const HiddenStatusUserSchema = new mongoose.Schema(
  {
    user: {
      // the person doing the hiding (viewer)
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    hiddenUser: {
      // the person whose stories get hidden
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Prevent duplicate hide entries for the same pair
HiddenStatusUserSchema.index({ user: 1, hiddenUser: 1 }, { unique: true });

module.exports =
  mongoose.models.hiddenStatusUser ||
  mongoose.model("hiddenStatusUser", HiddenStatusUserSchema);
