# Scaleway Storage Integration Setup

This document explains how to set up Scaleway Object Storage for the Secret Trip application.

## Environment Variables

Add the following environment variables to your `.env` file:

```env
# Scaleway Object Storage Configuration
SCALEWAY_ACCESS_KEY_ID="SCW1QKRG5YRYE0BD3QC8"
SCALEWAY_SECRET_ACCESS_KEY="143930de-0489-4ca2-8b2b-02367b1645d9"
SCALEWAY_REGION="nl-ams"
SCALEWAY_BUCKET_NAME="secret-trip-storage"
```

## What's Been Updated

### 1. Scaleway Storage Service (`src/services/scalewayStorage.service.js`)
- Complete service for uploading, downloading, and managing files on Scaleway
- Supports both buffer and local file uploads
- Handles file deletion and URL generation
- Includes error handling and logging

### 2. Upload Middleware (`src/middlewares/scalewayUpload.js`)
- New middleware that uses memory storage with multer
- Automatically uploads files to Scaleway after processing
- Supports profile photos, mission photos, and multiple file uploads
- Includes proper error handling

### 3. Mission Photo Service (`src/services/missionPhoto.service.js`)
- Updated to use Scaleway for storing mission photos and thumbnails
- Added buffer-based image processing for Scaleway uploads
- Maintains backward compatibility with legacy file processing
- Handles photo deletion from Scaleway when retaking photos

### 4. Album Service (`src/services/album.service.js`)
- Updated PDF generation to download images from Scaleway URLs
- PDFs are now generated locally and uploaded to Scaleway
- Temporary files are cleaned up after upload
- Supports both Scaleway and legacy local file URLs

### 5. Profile Service (`src/services/profile.service.js`)
- Profile photos are now uploaded to Scaleway
- Old photos are deleted from Scaleway when updating
- Maintains proper error handling and logging

### 6. Static File Serving
- Removed local static file serving since files are now on Scaleway
- All file URLs now point to Scaleway Object Storage

## File Organization on Scaleway

Files are organized in the following structure:
```
secret-trip-storage/
├── profile-photos/
│   └── profile_userId_timestamp.jpg
├── mission-photos/
│   ├── mission_missionId_processed_timestamp.jpg
│   └── thumbnails/
│       └── mission_missionId_thumb_timestamp.jpg
└── albums/
    ├── album_tripId_standard_timestamp.pdf
    └── album_tripId_hd_timestamp.pdf
```

## Benefits

1. **Scalability**: No local storage limitations
2. **Reliability**: Files are stored in Scaleway's robust infrastructure
3. **Performance**: Direct public access to files (no authentication required)
4. **Cost-effective**: Pay only for what you use
5. **Global Access**: Files accessible from anywhere via direct URLs
6. **Simple**: No signed URL management needed

## Migration Notes

- Existing local files will continue to work (legacy support)
- New uploads will automatically go to Scaleway
- PDF generation downloads images from Scaleway URLs
- All new file URLs will be Scaleway direct URLs (no authentication required)
- Files are publicly accessible via direct URLs

## Testing

To test the integration:

1. Set up your Scaleway credentials in `.env`
2. Create a Scaleway bucket named `secret-trip-storage`
3. Start the application
4. Try uploading a profile photo or mission photo
5. Check that files appear in your Scaleway bucket
6. Verify that file URLs point to Scaleway

## Troubleshooting

- Check that all environment variables are set correctly
- Verify that the Scaleway bucket exists and is accessible
- Check the application logs for any upload errors
- Ensure your Scaleway credentials have the necessary permissions
