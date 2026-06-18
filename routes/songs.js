const express = require("express");
const router = express.Router();
const axios = require("axios");
const auth = require("../middleware/auth");

const JAMENDO_CLIENT_ID = process.env.JAMENDO_CLIENT_ID;

router.get("/", auth, async (req, res) => {
  try {
    const { q = "", per_page = 20 } = req.query;

    const { data } = await axios.get("https://api.jamendo.com/v3.0/tracks/", {
      params: {
        client_id: JAMENDO_CLIENT_ID,
        format: "json",
        limit: per_page,
        search: q || undefined,
        audioformat: "mp31", // streamable mp3
        include: "musicinfo",
        order: "popularity_total",
        imagesize: 100,
      },
    });

    const songs = data.results.map((track) => ({
      id: String(track.id),
      title: track.name,
      artist: track.artist_name,
      src: track.audio,
      cover: track.image || null,
      duration: track.duration,
    }));

    res.json({ success: true, total: data.headers.results_count, songs });
  } catch (err) {
    console.error("Jamendo music error:", err.message);
    res.status(500).json({ success: false, message: "Failed to fetch songs" });
  }
});

module.exports = router;
