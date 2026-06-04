const express = require("express");
const router = express.Router();
const puzzleController = require("../controllers/puzzleController");


router.post("/puzzle/submit", puzzleController.submitResult);

module.exports = router;
