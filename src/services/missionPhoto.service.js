const { prisma } = require('../config/prisma');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

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
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter
  }).single('missionPhoto');
};

// 🛑 Error handler middleware
exports.handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message: err.code === 'LIMIT_FILE_SIZE'
        ? 'File too large. Max is 10MB.'
        : 'Multer error: ' + err.message
    });
  }
  if (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next();
};

// 📸 Submit mission photo
exports.submitMissionPhoto = async ({ missionId, userId, photoPath, caption = null }) => {
  try {
    const mission = await prisma.assignedMission.findUnique({
      where: { id: missionId },
      include: { trip: true, user: true }
    });

    if (!mission) throw new Error('Mission not found');
    if (mission.userId !== userId) throw new Error('Unauthorized');
    if (mission.completed) throw new Error('Already completed');
    if (mission.trip.status !== 'ACTIVE') throw new Error('Trip not active');

    const processedImagePath = await exports.processImage(photoPath);
    const thumbnailPath = await exports.generateThumbnail(processedImagePath);

    const updatedMission = await prisma.assignedMission.update({
      where: { id: missionId },
      data: {
        photoUrl: `/uploads/mission-photos/${path.basename(processedImagePath)}`,
        thumbnailUrl: `/uploads/mission-photos/thumbnails/${path.basename(thumbnailPath)}`,
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

    if (photoPath !== processedImagePath) {
      try { fs.unlinkSync(photoPath); } catch (err) { console.error(err); }
    }

    return {
      mission: updatedMission,
      message: 'Mission completed successfully!',
      photoUrl: updatedMission.photoUrl,
      thumbnailUrl: updatedMission.thumbnailUrl
    };
  } catch (error) {
    if (photoPath && fs.existsSync(photoPath)) {
      try { fs.unlinkSync(photoPath); } catch (err) { console.error(err); }
    }
    throw error;
  }
};

// 🧠 Process full-size image
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

// 🧩 Create thumbnail
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
    include: { trip: true },
    orderBy: { createdAt: 'asc' }
  });

  return missions.map(m => ({
    id: m.id,
    title: m.title,
    instruction: m.instruction,
    category: m.category,
    sampleImageUrl: m.sampleImageUrl,
    photoUrl: m.photoUrl,
    thumbnailUrl: m.thumbnailUrl,
    caption: m.caption,
    completed: m.completed,
    submittedAt: m.submittedAt,
    createdAt: m.createdAt,
    tripName: m.trip.name,
    tripStatus: m.trip.status,
    canSubmit: m.trip.status === 'ACTIVE' && !m.completed
  }));
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

  // delete previous files
  if (mission.photoUrl) {
    const full = path.join(__dirname, '../uploads/mission-photos', path.basename(mission.photoUrl));
    const thumb = path.join(__dirname, '../uploads/mission-photos/thumbnails', path.basename(mission.photoUrl));
    try {
      if (fs.existsSync(full)) fs.unlinkSync(full);
      if (fs.existsSync(thumb)) fs.unlinkSync(thumb);
    } catch (err) {
      console.error('Error deleting old photo files:', err);
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
