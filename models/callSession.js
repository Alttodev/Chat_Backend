const mongoose = require("mongoose");

const CallSessionSchema = new mongoose.Schema(
  {
    callerId: {
      type: String,
      required: true,
    },
    receiverId: {
      type: String,
      required: true,
    },
    callerName: String,
    callerImage: String,

    status: {
      type: String,
      enum: [
        "ringing",
        "accepted",
        "ended",
        "rejected",
      ],
      default: "ringing",
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model(
  "CallSession",
  CallSessionSchema,
);