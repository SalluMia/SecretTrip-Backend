const { prisma } = require('../config/prisma');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const scalewayStorage = require('./scalewayStorage.service');

// Helper function to ensure URLs are accessible (simplified for public bucket)
async function ensureAccessibleUrl(url) {
  if (!url) return null;
  
  // For public bucket, URLs are directly accessible
  return url;
}

// 📂 Setup upload path
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads/mission-photos');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${req.params.missionId}_${Date.now()}_${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|heic|heif/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  if (mimetype && extname) cb(null, true);
  else cb(new Error('Only image files are allowed'), false);
};

// 📦 Upload Middleware via function (Option 2)
exports.getUploadMiddleware = () => {
  return multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit (increased from 10MB)
    fileFilter
  }).single('missionPhoto');
};

// 🛑 Error handler middleware
exports.handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message: err.code === 'LIMIT_FILE_SIZE'
        ? 'File too large. Max is 50MB.'
        : 'Multer error: ' + err.message
    });
  }
  if (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next();
};

// 📸 Submit mission photo
exports.submitMissionPhoto = async ({ missionId, userId, photoBuffer, originalName, caption = null }) => {
  try {
    const mission = await prisma.assignedMission.findUnique({
      where: { id: missionId },
      include: { trip: true, user: true }
    });

    if (!mission) throw new Error('Mission not found');
    if (mission.userId !== userId) throw new Error('Unauthorized');
    if (mission.completed) throw new Error('Already completed');
    if (mission.trip.status !== 'ACTIVE') throw new Error('Trip not active');

    // Process image in memory
    const processedImageBuffer = await exports.processImageBuffer(photoBuffer);
    const thumbnailBuffer = await exports.generateThumbnailBuffer(processedImageBuffer);

    // Generate unique filenames
    const processedFileName = scalewayStorage.generateUniqueFileName(
      originalName, 
      `mission_${missionId}_processed`
    );
    const thumbnailFileName = scalewayStorage.generateUniqueFileName(
      originalName, 
      `mission_${missionId}_thumb`
    );

    // Upload to Scaleway
    const [processedUpload, thumbnailUpload] = await Promise.all([
      scalewayStorage.uploadFile(
        processedImageBuffer,
        processedFileName,
        'mission-photos',
        'image/jpeg'
      ),
      scalewayStorage.uploadFile(
        thumbnailBuffer,
        thumbnailFileName,
        'mission-photos/thumbnails',
        'image/jpeg'
      )
    ]);

    const updatedMission = await prisma.assignedMission.update({
      where: { id: missionId },
      data: {
        photoUrl: processedUpload.url,
        thumbnailUrl: thumbnailUpload.url,
        caption,
        completed: true,
        submittedAt: new Date()
      },
      include: {
        trip: true,
        user: true
      }
    });

    const completedMissions = await prisma.assignedMission.count({
      where: { tripId: mission.trip.id, completed: true }
    });

    await prisma.trip.update({
      where: { id: mission.trip.id },
      data: { completedMissions }
    });

    // Ensure URLs are accessible
    const accessiblePhotoUrl = await ensureAccessibleUrl(updatedMission.photoUrl);
    const accessibleThumbnailUrl = await ensureAccessibleUrl(updatedMission.thumbnailUrl);

    return {
      mission: updatedMission,
      message: 'Mission completed successfully!',
      photoUrl: accessiblePhotoUrl,
      thumbnailUrl: accessibleThumbnailUrl
    };
  } catch (error) {
    console.error('Error submitting mission photo:', error);
    throw error;
  }
};

// 🧠 Process full-size image (buffer version for Scaleway)
exports.processImageBuffer = async (imageBuffer) => {
  try {
    return await sharp(imageBuffer)
      .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, progressive: true })
      .toBuffer();
  } catch (err) {
    console.error('Image processing failed:', err);
    return imageBuffer; // Return original if processing fails
  }
};

// 🧩 Create thumbnail (buffer version for Scaleway)
exports.generateThumbnailBuffer = async (imageBuffer) => {
  try {
    return await sharp(imageBuffer)
      .resize(300, 300, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch (err) {
    console.error('Thumbnail generation failed:', err);
    return imageBuffer; // Return original if processing fails
  }
};

// 🧠 Process full-size image (legacy file version - kept for compatibility)
exports.processImage = async (originalPath) => {
  try {
    const outputPath = originalPath.replace(path.extname(originalPath), '_processed.jpg');
    await sharp(originalPath)
      .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, progressive: true })
      .toFile(outputPath);
    return outputPath;
  } catch (err) {
    console.error('Image processing failed:', err);
    return originalPath;
  }
};

// 🧩 Create thumbnail (legacy file version - kept for compatibility)
exports.generateThumbnail = async (imagePath) => {
  try {
    const thumbDir = path.join(path.dirname(imagePath), 'thumbnails');
    if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });

    const thumbnailPath = path.join(thumbDir, path.basename(imagePath));
    await sharp(imagePath)
      .resize(300, 300, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath);

    return thumbnailPath;
  } catch (err) {
    console.error('Thumbnail generation failed:', err);
    return imagePath;
  }
};

// 🎯 Get missions by user & trip
exports.getUserMissions = async ({ userId, tripId, status = null }) => {
  const where = { userId, tripId };
  if (status === 'completed') where.completed = true;
  else if (status === 'pending') where.completed = false;

  const missions = await prisma.assignedMission.findMany({
    where,
    include: { 
      trip: {
        select: {
          id: true,
          name: true,
          status: true,
          theme: true,
          tripMode: true
        }
      },
      // ✅ INCLUDE MISSION TEMPLATE DATA
      missionTemplate: {
        select: {
          id: true,
          title: true,
          instruction: true,
          category: true,
          level: true,
          location: true,
          sampleImageUrl: true,
          isActive: true,
          createdAt: true,
          updatedAt: true
        }
      }
    },
    orderBy: [
      { dayAssigned: 'asc' },
      { createdAt: 'asc' }
    ]
  });

  // Process missions and ensure URLs are accessible
  const processedMissions = await Promise.all(missions.map(async (m) => {
    const accessiblePhotoUrl = await ensureAccessibleUrl(m.photoUrl);
    const accessibleThumbnailUrl = await ensureAccessibleUrl(m.thumbnailUrl);
    const accessibleSampleImageUrl = await ensureAccessibleUrl(m.missionTemplate?.sampleImageUrl || m.sampleImageUrl);

    return {
      // Assigned Mission Data
      id: m.id,
      userId: m.userId,
      tripId: m.tripId,
      completed: m.completed,
      photoUrl: accessiblePhotoUrl,
      thumbnailUrl: accessibleThumbnailUrl,
      caption: m.caption,
      dayAssigned: m.dayAssigned,
      submittedAt: m.submittedAt,
      createdAt: m.createdAt,
      
      // Mission Template Data (priority given to template, fallback to assigned mission)
      missionTemplateId: m.missionTemplateId,
      title: m.missionTemplate?.title || m.title,
      instruction: m.missionTemplate?.instruction || m.instruction,
      category: m.missionTemplate?.category || m.category,
      sampleImageUrl: accessibleSampleImageUrl,
      level: m.missionTemplate?.level || 'NORMAL',
      location: m.missionTemplate?.location,
      
      // Trip Data
      tripName: m.trip.name,
      tripStatus: m.trip.status,
      tripTheme: m.trip.theme,
      tripMode: m.trip.tripMode,
      
      // Complete Mission Template Object
      missionTemplate: m.missionTemplate ? {
        id: m.missionTemplate.id,
        title: m.missionTemplate.title,
        instruction: m.missionTemplate.instruction,
        category: m.missionTemplate.category,
        level: m.missionTemplate.level,
        location: m.missionTemplate.location,
        sampleImageUrl: accessibleSampleImageUrl,
        isActive: m.missionTemplate.isActive,
        createdAt: m.missionTemplate.createdAt,
        updatedAt: m.missionTemplate.updatedAt
      } : null,
      
      // Computed fields
      canSubmit: m.trip.status === 'ACTIVE' && !m.completed,
      submitted: !!m.photoUrl || !!m.submittedAt,
      canSwap: m.trip.status === 'ACTIVE' && !m.completed
    };
  }));

  return processedMissions;
};

// Enhanced getMissionDetail WITH MISSION TEMPLATE DATA
exports.getMissionDetail = async ({ userId, missionId }) => {
  try {
    // Get the mission with complete trip details AND mission template
    const mission = await prisma.assignedMission.findUnique({
      where: { id: missionId },
      include: {
        trip: {
          select: {
            id: true,
            name: true,
            status: true,
            startDate: true,
            endDate: true,
            theme: true,
            tripMode: true,
            description: true,
            createdAt: true,
            members: {
              select: {
                id: true,
                displayName: true,
                profilePhotoUrl: true
              }
            }
          }
        },
        // ✅ INCLUDE MISSION TEMPLATE DATA
        missionTemplate: {
          select: {
            id: true,
            title: true,
            instruction: true,
            category: true,
            level: true,
            location: true,
            sampleImageUrl: true,
            isActive: true,
            createdAt: true,
            updatedAt: true
          }
        }
      }
    });

    if (!mission) {
      throw new Error('Mission not found');
    }

    // Verify user owns this mission
    if (mission.userId !== userId) {
      throw new Error('Unauthorized access to this mission');
    }

    // Get user's alias for this trip
    const userAlias = await prisma.tripAlias.findUnique({
      where: {
        tripId_userId: {
          tripId: mission.tripId,
          userId: userId
        }
      },
      select: {
        alias: true
      }
    });

    // Calculate trip duration and current day
    const tripStartDate = new Date(mission.trip.startDate);
    const tripEndDate = new Date(mission.trip.endDate);
    const currentDate = new Date();
    
    const tripDuration = Math.ceil((tripEndDate - tripStartDate) / (1000 * 60 * 60 * 24));
    const currentDay = mission.trip.status === 'ACTIVE' 
      ? Math.max(1, Math.ceil((currentDate - tripStartDate) / (1000 * 60 * 60 * 24)))
      : null;

    // Return mission detail with complete trip information AND mission template
    return {
      // Assigned Mission Data
      id: mission.id,
      userId: mission.userId,
      tripId: mission.tripId,
      completed: mission.completed,
      photoUrl: mission.photoUrl,
      thumbnailUrl: mission.thumbnailUrl,
      caption: mission.caption,
      dayAssigned: mission.dayAssigned,
      createdAt: mission.createdAt,
      submittedAt: mission.submittedAt,
      
      // Mission Template Data (priority given to template, fallback to assigned mission)
      missionTemplateId: mission.missionTemplateId,
      title: mission.missionTemplate?.title || mission.title,
      instruction: mission.missionTemplate?.instruction || mission.instruction,
      category: mission.missionTemplate?.category || mission.category,
      sampleImageUrl: mission.missionTemplate?.sampleImageUrl || mission.sampleImageUrl,
      level: mission.missionTemplate?.level || 'NORMAL',
      location: mission.missionTemplate?.location,
      
      // Complete Mission Template Object
      missionTemplate: mission.missionTemplate ? {
        id: mission.missionTemplate.id,
        title: mission.missionTemplate.title,
        instruction: mission.missionTemplate.instruction,
        category: mission.missionTemplate.category,
        level: mission.missionTemplate.level,
        location: mission.missionTemplate.location,
        sampleImageUrl: mission.missionTemplate.sampleImageUrl,
        isActive: mission.missionTemplate.isActive,
        createdAt: mission.missionTemplate.createdAt,
        updatedAt: mission.missionTemplate.updatedAt
      } : null,
      
      // Complete trip details
      trip: {
        id: mission.trip.id,
        name: mission.trip.name,
        description: mission.trip.description,
        status: mission.trip.status,
        theme: mission.trip.theme,
        tripMode: mission.trip.tripMode,
        startDate: mission.trip.startDate,
        endDate: mission.trip.endDate,
        duration: tripDuration,
        currentDay: currentDay,
        createdAt: mission.trip.createdAt,
        memberCount: mission.trip.members.length,
        members: mission.trip.members
      },
      
      // User's context in this trip
      userAlias: userAlias?.alias || null,
      
      // Computed fields
      submitted: !!mission.photoUrl || !!mission.submittedAt,
      canSubmit: mission.trip.status === 'ACTIVE' && !mission.completed,
      canSwap: mission.trip.status === 'ACTIVE' && !mission.completed,
      canEdit: mission.userId === userId && !mission.completed,
      isOverdue: mission.dayAssigned && currentDay ? currentDay > mission.dayAssigned : false
    };

  } catch (error) {
    console.error('Error getting mission detail:', error);
    throw error;
  }
};

// 🔁 Retake mission photo
exports.retakeMissionPhoto = async ({ missionId, userId }) => {
  const mission = await prisma.assignedMission.findUnique({
    where: { id: missionId },
    include: { trip: true }
  });

  if (!mission) throw new Error('Mission not found');
  if (mission.userId !== userId) throw new Error('Unauthorized');
  if (mission.trip.status !== 'ACTIVE') throw new Error('Trip not active');

  // Delete previous files from Scaleway
  if (mission.photoUrl) {
    try {
      const photoKey = scalewayStorage.extractKeyFromUrl(mission.photoUrl);
      const thumbnailKey = scalewayStorage.extractKeyFromUrl(mission.thumbnailUrl);
      
      if (photoKey) {
        await scalewayStorage.deleteFile(photoKey);
      }
      if (thumbnailKey) {
        await scalewayStorage.deleteFile(thumbnailKey);
      }
    } catch (err) {
      console.error('Error deleting old photo files from Scaleway:', err);
    }
  }

  const updated = await prisma.assignedMission.update({
    where: { id: missionId },
    data: {
      photoUrl: null,
      thumbnailUrl: null,
      caption: null,
      completed: false,
      submittedAt: null
    }
  });

  const completedCount = await prisma.assignedMission.count({
    where: { tripId: mission.tripId, completed: true }
  });

  await prisma.trip.update({
    where: { id: mission.tripId },
    data: { completedMissions: completedCount }
  });

  return {
    mission: updated,
    message: 'Mission reset successfully.'
  };
};

// 📊 Trip-level stats
exports.getMissionStatistics = async (tripId) => {
  const total = await prisma.assignedMission.aggregate({
    where: { tripId },
    _count: { id: true }
  });

  const completed = await prisma.assignedMission.aggregate({
    where: { tripId, completed: true },
    _count: { id: true }
  });

  const categoryStats = await prisma.assignedMission.groupBy({
    by: ['category'],
    where: { tripId },
    _count: { id: true }
  });

  const topUsers = await prisma.assignedMission.groupBy({
    by: ['userId'],
    where: { tripId, completed: true },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } }
  });

  return {
    totalMissions: total._count.id,
    completedMissions: completed._count.id,
    completionRate: total._count.id > 0
      ? ((completed._count.id / total._count.id) * 100).toFixed(1)
      : 0,
    categoryBreakdown: categoryStats.reduce((acc, item) => {
      acc[item.category.toLowerCase()] = item._count.id;
      return acc;
    }, {}),
    topContributors: topUsers.slice(0, 5).map(u => ({
      userId: u.userId,
      completedMissions: u._count.id
    }))
  };
};

// 🖼️ Fetch all trip photos
exports.getTripPhotos = async (tripId) => {
  const missions = await prisma.assignedMission.findMany({
    where: { tripId, completed: true, photoUrl: { not: null } },
    include: {
      user: {
        select: { id: true, displayName: true }
      }
    },
    orderBy: { submittedAt: 'asc' }
  });

  return missions.map(m => ({
    id: m.id,
    title: m.title,
    instruction: m.instruction,
    category: m.category,
    photoUrl: m.photoUrl,
    thumbnailUrl: m.thumbnailUrl,
    caption: m.caption,
    submittedAt: m.submittedAt,
    photographer: m.user.displayName,
    photographerId: m.user.id
  }));
};


