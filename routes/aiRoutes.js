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

const SMALLTALK = [
  {
    patterns: ["thanks", "thank you", "thx", "ty", "appreciate it"],
    reply: "You're welcome! Let me know if there's anything else you need.",
  },
  {
    patterns: ["hi", "hello", "hey", "yo", "hiya"],
    reply:
      "Hey! Ask me anything about using Clix — posts, polls, live, stories, and more.",
  },
  {
    patterns: ["bye", "goodbye", "see you", "later"],
    reply: "Bye! Come back anytime you need help with Clix.",
  },
  {
    patterns: ["ok", "okay", "cool", "great", "nice", "got it"],
    reply: "Glad that helped! Anything else I can do for you?",
  },
];

function findSmalltalk(message) {
  const normalized = message.toLowerCase().trim();
  const words = new Set(tokenize(normalized));

  for (const entry of SMALLTALK) {
    const matches = entry.patterns.some(
      (p) => p === normalized || words.has(p),
    );
    if (matches) return entry.reply;
  }

  return null;
}

function tokenize(str) {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function findFaqMatch(message) {
  const messageWords = new Set(tokenize(message));

  let best = null;
  let bestScore = 0;

  for (const entry of FAQ) {
    let score = 0;

    for (const keyword of entry.keywords) {
      const keywordWords = tokenize(keyword);
      // Every word in this keyword phrase must appear as its own exact
      // word in the message — not just be contained inside a longer word.
      const allWordsPresent = keywordWords.every((w) => messageWords.has(w));
      if (allWordsPresent) {
        score += keywordWords.length;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

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

    const smalltalkReply = findSmalltalk(message);
    if (smalltalkReply) {
      return res.json({
        success: true,
        reply: smalltalkReply,
        source: "smalltalk",
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
