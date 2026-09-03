const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const FAQ = require("../config/clixFaq");
const { generateWithAI } = require("../utils/ai");

async function callAIModel(message, history) {
  const systemPrompt = `You are Clix AI, a support assistant for the Clix social app.
Only answer questions about how to use Clix's features. Here is everything
you're allowed to treat as fact about the app:
 
${FAQ.map((f) => `- ${f.answer}`).join("\n")}
 
If the question is unrelated to using Clix, politely say you can only help
with Clix features. Keep answers under 3 sentences.
 
Reply with ONLY the direct answer text. Do not include a preamble, a
disclaimer, meta-commentary, or any note about safety, policy, or
guidelines — just the answer a support bot would say out loud.
 
Recent conversation:
${history.map((h) => `${h.role}: ${h.text}`).join("\n")}
 
User: ${message}`;

  const raw = await generateWithAI(systemPrompt);
  return sanitizeAIReply(raw);
}

// Defensive cleanup: free-tier OpenRouter models are auto-routed, so the
// actual model backing any given request varies — some append boilerplate
// like "Note: for user safety..." regardless of the prompt. Strip lines
// that are clearly meta-commentary rather than the actual answer.
function sanitizeAIReply(text) {
  if (!text) return text;

  const noisePatterns = [
    /^\(?note:?.*$/im,
    /.*\buser safety\b.*/gi,
    /.*\bcontent policy\b.*/gi,
    /.*\bas an ai\b.*/gi,
    /.*\bi (must|should) (remind|note|mention)\b.*/gi,
  ];

  let cleaned = text;
  for (const pattern of noisePatterns) {
    cleaned = cleaned.replace(pattern, "");
  }

  return cleaned.replace(/\n{2,}/g, "\n").trim();
}

// Simple keyword-overlap scorer — no external dependency needed for
// something this small.
function findFaqMatch(message) {
  const normalized = message.toLowerCase();
  let best = null;
  let bestScore = 0;

  for (const entry of FAQ) {
    const score = entry.keywords.reduce(
      (sum, kw) => sum + (normalized.includes(kw) ? kw.split(" ").length : 0),
      0,
    );
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  // Require at least a 2-word-equivalent match so single common words
  // (like "post" alone) don't trigger overly confident wrong matches.
  return bestScore >= 2 ? best : null;
}

router.post("/chatbot", auth, async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    const faqMatch = findFaqMatch(message);
    if (faqMatch) {
      return res.json({
        success: true,
        reply: faqMatch.answer,
        source: "faq",
      });
    }

    const aiReply = await callAIModel(message.trim(), history.slice(-6));

    return res.json({
      success: true,
      reply:
        aiReply ||
        "I'm not sure about that one — try asking about posts, polls, live, stories, or messages.",
      source: "ai",
    });
  } catch (err) {
    console.error("CHATBOT ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

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
