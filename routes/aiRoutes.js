const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { generateWithAI } = require("../utils/ai");

router.post("/post-caption", auth, async (req, res) => {
  try {
    const { prompt } = req.body;

    const text = await generateWithAI(`
Write a catchy social media caption.

Prompt:
${prompt}

Return only the final caption.
`);

    res.json({
      success: true,
      text,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;
