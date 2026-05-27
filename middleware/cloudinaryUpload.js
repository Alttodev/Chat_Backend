const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;

const DEFAULT_IMAGE_FORMATS = ["jpg", "jpeg", "png", "gif", "webp", "avif"];
const VIDEO_FORMATS = ["mp4"];
const AUDIO_FORMATS = [
  "mp3",
  "m4a",
  "aac",
  "wav",
  "ogg",
  "oga",
  "webm",
  "amr",
  "3gp",
  "mp4",
];
const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024;
const MEDIA_MAX_FILE_SIZE = 30 * 1024 * 1024;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const createCloudinaryUpload = ({
  allowedFormats = DEFAULT_IMAGE_FORMATS,
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  allowVideo = false,
  allowAudio = false,
  errorMessage = "Only image files are allowed",
} = {}) => {
  const storage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder: "chat_app_uploads",
      allowed_formats: allowedFormats,
      resource_type: "auto",
    },
  });

  const fileFilter = (req, file, cb) => {
    const isImage = file.mimetype && file.mimetype.startsWith("image/");
    const isVideo = allowVideo && file.mimetype === "video/mp4";
    const isAudio = allowAudio && file.mimetype && file.mimetype.startsWith("audio/");

    if (isImage || isVideo || isAudio) {
      cb(null, true);
      return;
    }

    cb(new Error(errorMessage), false);
  };

  return multer({
    storage,
    fileFilter,
    limits: { fileSize: maxFileSize },
  });
};

const deleteUploadedMedia = async (file) => {
  if (!file?.filename) {
    return;
  }

  const resourceType =
    file.resource_type ||
    (file.mimetype?.startsWith("video/") ||
    file.mimetype?.startsWith("audio/")
      ? "video"
      : "image");

  try {
    await cloudinary.uploader.destroy(file.filename, {
      resource_type: resourceType,
    });
  } catch (err) {
    console.warn("Cloudinary cleanup failed:", err.message);
  }
};

const ensureVideoDuration = async (file, maxSeconds = 60) => {
  if (!file?.mimetype?.startsWith("video/")) {
    return;
  }

  const resource = await cloudinary.api.resource(file.filename, {
    resource_type: "video",
  });

  if (typeof resource?.duration !== "number" || resource.duration <= maxSeconds) {
    return;
  }

  await deleteUploadedMedia(file);

  const error = new Error(`Video must be ${maxSeconds} seconds or less`);
  error.statusCode = 400;
  throw error;
};

const ensureMediaDuration = async (file, maxSeconds = 60) => {
  if (
    !file?.mimetype?.startsWith("video/") &&
    !file?.mimetype?.startsWith("audio/")
  ) {
    return;
  }

  const resource = await cloudinary.api.resource(file.filename, {
    resource_type: "video",
  });

  if (typeof resource?.duration !== "number" || resource.duration <= maxSeconds) {
    return;
  }

  await deleteUploadedMedia(file);

  const error = new Error(
    file.mimetype?.startsWith("audio/")
      ? `Audio must be ${maxSeconds} seconds or less`
      : `Video must be ${maxSeconds} seconds or less`,
  );
  error.statusCode = 400;
  throw error;
};

const imageUpload = createCloudinaryUpload();
const mediaUpload = createCloudinaryUpload({
  allowedFormats: [...DEFAULT_IMAGE_FORMATS, ...VIDEO_FORMATS, ...AUDIO_FORMATS],
  maxFileSize: MEDIA_MAX_FILE_SIZE,
  allowVideo: true,
  allowAudio: true,
  errorMessage: "Only image, audio, and MP4 files are allowed",
});

module.exports = imageUpload;
module.exports.createCloudinaryUpload = createCloudinaryUpload;
module.exports.imageUpload = imageUpload;
module.exports.mediaUpload = mediaUpload;
module.exports.deleteUploadedMedia = deleteUploadedMedia;
module.exports.ensureVideoDuration = ensureVideoDuration;
module.exports.ensureMediaDuration = ensureMediaDuration;
