# Cloudinary Integration Setup Guide

This guide will help you integrate Cloudinary for image storage in your chat and post uploads.

## What Changed

- **Local file uploads** have been replaced with **Cloudinary cloud storage**
- Images are now stored securely in the cloud with automatic optimization
- All image URLs are now CDN-delivered Cloudinary URLs for better performance

## Prerequisites

1. Create a Cloudinary account at [cloudinary.com](https://cloudinary.com)
2. Get your Cloudinary credentials from your account dashboard

## Step 1: Get Your Cloudinary Credentials

1. Sign up at [https://cloudinary.com](https://cloudinary.com)
2. Go to your **Dashboard** (https://cloudinary.com/console)
3. Copy your credentials:
   - **Cloud Name**: Your unique cloud identifier
   - **API Key**: Your API key
   - **API Secret**: Your API secret (keep this private!)

## Step 2: Update Your .env File

Add the following to your `.env` file in the root directory:

```env
CLOUDINARY_CLOUD_NAME=your_cloud_name_here
CLOUDINARY_API_KEY=your_api_key_here
CLOUDINARY_API_SECRET=your_api_secret_here
```

Replace the values with your actual Cloudinary credentials.

## Step 3: Verify Installation

The required packages have been installed:
- `cloudinary` - Cloudinary SDK
- `multer-storage-cloudinary` - Multer storage driver for Cloudinary

## Files Modified

### New Files Created
- `middleware/cloudinaryUpload.js` - New Cloudinary upload middleware
- `.env.example` - Environment variables template

### Files Updated
- `routes/postRoutes.js` - Updated to use Cloudinary for post images
- `routes/chatRoutes.js` - Updated to use Cloudinary for message images
- `package.json` - Added Cloudinary dependencies

## How It Works

### Upload Middleware (`middleware/cloudinaryUpload.js`)

```javascript
const upload = require("../middleware/cloudinaryUpload");

// Usage in routes:
router.post("/create", auth, upload.single("image"), async (req, res) => {
  // When file is uploaded:
  // req.file.path = Cloudinary secure URL (e.g., https://res.cloudinary.com/...)
  // req.file.filename = public_id in Cloudinary
  // req.file.size = file size in bytes
});
```

### Image Storage

- **Post Images**: Stored via `POST /posts/create` endpoint
- **Chat Message Images**: Stored via `POST /conversations/:targetUserId/messages` endpoint
- **Folder Structure**: All uploads go to `chat_app_uploads/` folder in Cloudinary
- **File Limit**: 5 MB per file
- **Supported Formats**: JPG, JPEG, PNG, GIF, WebP, AVIF

## Benefits

✅ **No local storage needed** - Save disk space on your server  
✅ **Automatic optimization** - Images are automatically optimized for web  
✅ **CDN delivery** - Fast image loading from Cloudinary's CDN  
✅ **Security** - No need to serve files from your server  
✅ **Scalability** - Handle unlimited image uploads  
✅ **Transformations** - Easy image resizing and transformations via URL  

## Using Cloudinary URLs

Images are now stored as full URLs. Access them directly in your frontend:

```javascript
// Before (local path)
image: "/uploads/1234567890-abc123.jpg"

// After (Cloudinary URL)
image: "https://res.cloudinary.com/your-cloud-name/image/upload/v123456/chat_app_uploads/abc123.jpg"
```

## Optional: Cloudinary Advanced Features

### Image Transformations

You can modify Cloudinary URLs to transform images on-the-fly:

```javascript
// Original URL
https://res.cloudinary.com/cloud/image/upload/v123/chat_app_uploads/image.jpg

// Resize to 300x300
https://res.cloudinary.com/cloud/image/upload/w_300,h_300,c_fill/v123/chat_app_uploads/image.jpg

// Quality optimization
https://res.cloudinary.com/cloud/image/upload/q_auto/v123/chat_app_uploads/image.jpg

// Combined transformations
https://res.cloudinary.com/cloud/image/upload/w_300,h_300,c_fill,q_auto/v123/chat_app_uploads/image.jpg
```

### Cloudinary Admin Panel

You can manage all uploads in your Cloudinary account:
1. Go to [https://cloudinary.com/console/media_library](https://cloudinary.com/console/media_library)
2. Browse all uploaded images in the `chat_app_uploads` folder
3. Delete or organize images as needed

## Troubleshooting

### Cloudinary Credentials Not Set
**Error**: "Configuration not found"  
**Solution**: Make sure your `.env` file contains valid Cloudinary credentials

### Upload Fails with 401/403
**Error**: Unauthorized access  
**Solution**: Verify your API Key and API Secret are correct

### Images Not Displaying
**Error**: 404 error for image URLs  
**Solution**: Check that the Cloudinary URL is returned correctly from the API response

## Next Steps

1. Restart your server
2. Test by uploading an image in a chat message or post
3. Verify the image is displayed correctly
4. Check your Cloudinary dashboard to see the uploaded images

## Keep Local Uploads Middleware?

If you want to keep the old local uploads functionality as a fallback:
- The original `middleware/upload.js` is still in your project
- You can use it for non-critical file uploads
- The `uploads/` folder and static serving in `index.js` remain unchanged

## Support

For issues with Cloudinary:
- Visit [Cloudinary Docs](https://cloudinary.com/documentation)
- Check [API Reference](https://cloudinary.com/documentation/image_upload_api_reference)
- Visit [Community Forum](https://support.cloudinary.com/)
