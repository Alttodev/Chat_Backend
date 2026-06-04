const PuzzleResult = require("../models/puzzleResult");

exports.submitResult = async (req, res) => {
  try {
    const { userId, puzzleId, score, timeMs } = req.body;
    if (!userId) return res.status(400).json({ message: "userId required" });

    const result = await PuzzleResult.create({
      userId,
      puzzleId: puzzleId || null,
      score: score || 0,
      timeMs: timeMs || 0,
    });

    return res.status(201).json({ success: true, result });
  } catch (err) {
    console.error("Error saving puzzle result:", err);
    return res.status(500).json({ message: "Failed to save result" });
  }
};
