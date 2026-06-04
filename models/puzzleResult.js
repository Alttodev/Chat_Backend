const mongoose = require("mongoose");

const PuzzleResultSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  puzzleId: { type: String, default: null },
  score: { type: Number, default: 0 },
  timeMs: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("puzzleresult", PuzzleResultSchema);
