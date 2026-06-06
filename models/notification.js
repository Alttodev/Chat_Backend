const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: [
        "comment-mention",
        "like",
        "comment"
      ],
    },
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "post",
      required: false,
    },
    commentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
    },
    comment: {
      type: String,
      required: false,
    },
    matchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "rpsmatch",
      required: false,
    },
    payload: {
      type: Object,
      default: {},
      required: false,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

module.exports =
  mongoose.models.Notification ||
  mongoose.model("Notification", notificationSchema);
