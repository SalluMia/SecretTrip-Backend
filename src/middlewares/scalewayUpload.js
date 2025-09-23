// middlewares/scalewayUpload.js
const multer = require('multer');
const path = require('path');
const scalewayStorage = require('../services/scalewayStorage.service');

// Configure multer to use memory storage for Scaleway uploads
const storage = multer.memoryStorage();

// File filter to accept images and PDFs
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|heic|heif|pdf/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (jpeg, jpg, png, gif, webp, heic, heif) and PDF files are allowed'), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: fileFilter
});

// Middleware for single profile photo upload
const uploadProfilePhoto = upload.single('profilePhoto');

// Middleware for mission photo upload
const uploadMissionPhoto = upload.single('missionPhoto');

// Middleware for multiple files upload
const uploadMultipleFiles = upload.array('files', 10); // Max 10 files

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum size is 50MB.'
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Too many files or unexpected field name.'
      });
    }
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  
  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  
  next();
};

// Middleware to upload file to Scaleway after multer processing
const uploadToScaleway = async (req, res, next) => {
  try {
    if (!req.file && !req.files) {
      return next();
    }

    const files = req.files || [req.file];
    const uploadResults = [];

    for (const file of files) {
      if (!file) continue;

      // Determine folder based on request context
      let folder = 'uploads';
      const requestPath = req.originalUrl || req.url || '';
      
      if (requestPath.includes('profile') || requestPath.includes('complete-profile') || requestPath.includes('update')) {
        folder = 'profile-photos';
      } else if (requestPath.includes('mission')) {
        folder = 'mission-photos';
      } else if (requestPath.includes('album')) {
        folder = 'albums';
      }
      
      console.log(`📁 Uploading to folder: ${folder} (detected from path: ${requestPath})`);

      // Generate filename based on folder type
      let uniqueFileName;
      if (folder === 'profile-photos' && req.user?.id) {
        // Use consistent filename for profile photos
        const ext = path.extname(file.originalname);
        uniqueFileName = `profile_${req.user.id}${ext}`;
      } else if (folder === 'mission-photos' && req.params?.missionId) {
        // For mission photos, check if it's a retake (update operation)
        const isRetakeOperation = requestPath.includes('retake') || req.body?.isRetake;
        if (isRetakeOperation) {
          // Use consistent filename for mission retakes
          const ext = path.extname(file.originalname);
          uniqueFileName = `mission_${req.params.missionId}_${Date.now()}${ext}`;
        } else {
          // For new mission submissions, use unique filename
          uniqueFileName = scalewayStorage.generateUniqueFileName(
            file.originalname,
            `mission_${req.params.missionId}`
          );
        }
      } else if (folder === 'albums') {
        // For album files (PDFs), use consistent naming
        const ext = path.extname(file.originalname);
        const tripId = req.params?.tripId || req.body?.tripId;
        const quality = req.body?.quality || 'standard';
        uniqueFileName = `album_${tripId}_${quality}_${Date.now()}${ext}`;
      } else {
        // Use unique filename for other files
        uniqueFileName = scalewayStorage.generateUniqueFileName(
          file.originalname,
          req.user?.id ? `user_${req.user.id}` : ''
        );
      }

      // For profile photos, delete old file first if it exists (only for update operations)
      if (folder === 'profile-photos' && req.user?.id) {
        // Check if this is an update operation (not profile creation)
        const isUpdateOperation = requestPath.includes('update') || requestPath.includes('/profile/update');
        
        if (isUpdateOperation) {
          try {
            // Get user's current profile photo URL from database to extract the correct key
            const { prisma } = require('../config/prisma');
            const currentUser = await prisma.user.findUnique({
              where: { id: req.user.id },
              select: { profilePhotoUrl: true }
            });
            
            if (currentUser?.profilePhotoUrl) {
              const oldKey = scalewayStorage.extractKeyFromUrl(currentUser.profilePhotoUrl);
              if (oldKey) {
                await scalewayStorage.deleteFile(oldKey);
                console.log('🗑️ Deleted old profile photo before update:', oldKey);
              }
            }
          } catch (error) {
            // Ignore error if file doesn't exist or other issues
            console.log('ℹ️ No old profile photo to delete or error:', error.message);
          }
        } else {
          console.log('ℹ️ Profile creation - no existing photo to delete');
        }
      }

      // For mission photos, delete old files if it's a retake operation
      if (folder === 'mission-photos' && req.params?.missionId) {
        const isRetakeOperation = requestPath.includes('retake') || req.body?.isRetake;
        
        if (isRetakeOperation) {
          try {
            // Get mission's current photo URLs from database to extract the correct keys
            const { prisma } = require('../config/prisma');
            const currentMission = await prisma.assignedMission.findUnique({
              where: { id: req.params.missionId },
              select: { photoUrl: true, thumbnailUrl: true }
            });
            
            if (currentMission?.photoUrl) {
              const oldPhotoKey = scalewayStorage.extractKeyFromUrl(currentMission.photoUrl);
              const oldThumbnailKey = scalewayStorage.extractKeyFromUrl(currentMission.thumbnailUrl);
              
              if (oldPhotoKey) {
                await scalewayStorage.deleteFile(oldPhotoKey);
                console.log('🗑️ Deleted old mission photo before retake:', oldPhotoKey);
              }
              if (oldThumbnailKey) {
                await scalewayStorage.deleteFile(oldThumbnailKey);
                console.log('🗑️ Deleted old mission thumbnail before retake:', oldThumbnailKey);
              }
            }
          } catch (error) {
            // Ignore error if files don't exist or other issues
            console.log('ℹ️ No old mission photos to delete or error:', error.message);
          }
        } else {
          console.log('ℹ️ New mission submission - no existing photos to delete');
        }
      }

      // For album files, delete old versions if updating
      if (folder === 'albums') {
        const tripId = req.params?.tripId || req.body?.tripId;
        const quality = req.body?.quality || 'standard';
        
        if (tripId) {
          try {
            // Get album's current PDF URLs from database
            const { prisma } = require('../config/prisma');
            const currentAlbum = await prisma.album.findUnique({
              where: { tripId: tripId },
              select: { pdfUrl: true, pdfHDUrl: true }
            });
            
            if (currentAlbum) {
              const oldPdfUrl = quality === 'hd' ? currentAlbum.pdfHDUrl : currentAlbum.pdfUrl;
              
              if (oldPdfUrl) {
                const oldKey = scalewayStorage.extractKeyFromUrl(oldPdfUrl);
                if (oldKey) {
                  await scalewayStorage.deleteFile(oldKey);
                  console.log(`🗑️ Deleted old ${quality} album PDF before update:`, oldKey);
                }
              }
            }
          } catch (error) {
            // Ignore error if files don't exist or other issues
            console.log('ℹ️ No old album files to delete or error:', error.message);
          }
        }
      }

      // Upload to Scaleway
      const uploadResult = folder === 'profile-photos' 
        ? await scalewayStorage.uploadFileExact(file.buffer, uniqueFileName, folder, file.mimetype)
        : await scalewayStorage.uploadFile(file.buffer, uniqueFileName, folder, file.mimetype);

      uploadResults.push({
        originalName: file.originalname,
        fileName: uniqueFileName,
        url: uploadResult.url,
        key: uploadResult.key,
        size: file.size,
        mimetype: file.mimetype
      });
    }

    // Attach upload results to request
    if (req.file) {
      req.file.scaleway = uploadResults[0];
    } else if (req.files) {
      req.files.scaleway = uploadResults;
    }

    next();
  } catch (error) {
    console.error('❌ Error uploading to Scaleway:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload file to cloud storage'
    });
  }
};

module.exports = {
  uploadProfilePhoto,
  uploadMissionPhoto,
  uploadMultipleFiles,
  handleMulterError,
  uploadToScaleway
};
