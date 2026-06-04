const mongoose = require("mongoose");

const MoveSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  move: { type: String, enum: ["rock", "paper", "scissors"], required: true },
});

const RpsMatchSchema = new mongoose.Schema({
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  toUserId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  status: { type: String, enum: ["pending", "accepted", "rejected", "completed"], default: "pending" },
  moves: { type: [MoveSchema], default: [] },
  winner: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

RpsMatchSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("rpsmatch", RpsMatchSchema);
