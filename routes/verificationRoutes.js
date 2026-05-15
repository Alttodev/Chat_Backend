const express = require("express");
const auth = require("../middleware/auth");
const {
  requestVerification,
  verifyAccount,
} = require("../controllers/verificationController");

const router = express.Router();

router.post("/request", auth, requestVerification);
router.get("/confirm", verifyAccount);

module.exports = router;