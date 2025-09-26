const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const UPLOADS_FOLDER = path.join(__dirname, "..", "uploads");

// ensure folder exists
if (!fs.existsSync(UPLOADS_FOLDER))
  fs.mkdirSync(UPLOADS_FOLDER, { recursive: true });

// sanitize and create unique filename
const filename = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const safeName = crypto.randomBytes(12).toString("hex");
  cb(null, `${Date.now()}-${safeName}${ext}`);
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_FOLDER),
  filename,
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype && file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

module.exports = upload;
