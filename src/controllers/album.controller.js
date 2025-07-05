// src/controllers/album.controller.js - IMPROVED VERSION WITH DEBUGGING
const albumService = require('../services/album.service');
const paymentService = require('../services/payment.service');
const { successResponse, errorResponse } = require('../utils/response');
const { prisma } = require('../config/prisma');
const missionPhotoService = require('../services/missionPhoto.service')
const path = require('path');
const fs = require('fs');
const { formatDate } = require('../utils/dateUtils');

// ✅ NEW: Diagnose photo issues for a trips
exports.diagnosePhotos = async (req, res) => {
  try {
    const { tripId } = req.params;

    console.log(`🔍 Starting photo diagnosis for trip: ${tripId}`);
    
    // Verify trip exists
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true, name: true }
    });

    if (!trip) {
      return res.status(404).json({
        message: 'Trip not found',
        tripId
      });
    }

    const diagnosis = await albumService.diagnoseMissionPhotos(tripId);

    res.status(200).json({
      message: 'Photo diagnosis complete',
      tripId,
      tripName: trip.name,
      data: diagnosis
    });

  } catch (error) {
    console.error('❌ Error diagnosing photos:', error);
    res.status(500).json({
      message: 'Failed to diagnose photos',
      error: error.message
    });
  }
};

// ✅ IMPROVED: Generate test album with better error handling and validation
exports.generateTestAlbum = async (req, res) => {
  try {
    const { tripId } = req.params;

    console.log(`🚀 Starting test album generation for trip: ${tripId}`);
    
    // ✅ Check directory structure first
    console.log('📁 Checking directory structure...');
    const directoryCheck = albumService.checkDirectoryStructure();
    
    if (!directoryCheck) {
      console.log('⚠️ Directory structure incomplete, attempting to fix...');
      try {
        // Try to recreate directories
        const staticDir = path.join(__dirname, '..', 'uploads');
        const dirs = [
          staticDir,
          path.join(staticDir, 'albums'),
          path.join(staticDir, 'albums', 'standard'),
          path.join(staticDir, 'albums', 'hd'),
          path.join(staticDir, 'mission-photos')
        ];

        dirs.forEach(dir => {
          if (!fs.existsSync(dir)) {
            console.log(`📁 Creating missing directory: ${dir}`);
            fs.mkdirSync(dir, { recursive: true });
          }
        });
      } catch (dirError) {
        console.error('❌ Failed to create directories:', dirError);
        return res.status(500).json({
          message: 'Failed to create upload directories',
          error: dirError.message
        });
      }
    }

    // ✅ Verify trip exists and has required data
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        members: { select: { id: true, displayName: true } },
        tripAliases: true,
        assignedMissions: {
          where: { completed: true, photoUrl: { not: null } },
          include: { user: { select: { displayName: true } } },
          orderBy: { submittedAt: 'asc' }
        }
      }
    });

    if (!trip) {
      return res.status(404).json({
        message: 'Trip not found',
        tripId
      });
    }

    console.log(`📊 Trip data:`, {
      tripId: trip.id,
      name: trip.name,
      membersCount: trip.members.length,
      completedMissions: trip.assignedMissions.length
    });

    if (trip.assignedMissions.length === 0) {
      return res.status(400).json({
        message: 'No completed missions with photos found for this trip',
        tripId,
        tripName: trip.name,
        suggestion: 'Make sure missions are completed and have photos uploaded'
      });
    }

    // ✅ Run photo diagnosis first
    console.log('🔍 Running photo diagnosis before album generation...');
    const diagnosis = await albumService.diagnoseMissionPhotos(tripId);
    
    if (diagnosis.issues.length > 0) {
      console.log(`⚠️ Found ${diagnosis.issues.length} photo issues. Proceeding anyway...`);
    }

    // ✅ Generate album with better error handling
    const result = await albumService.generateTripAlbum(tripId);

    // ✅ Verify the file actually exists
    const staticDir = path.join(__dirname, '..', 'uploads');
    const expectedFilePath = path.join(staticDir, result.standardPdfUrl.replace('/uploads/', ''));
    
    console.log(`🔍 Checking if PDF exists at: ${expectedFilePath}`);
    
    if (fs.existsSync(expectedFilePath)) {
      const stats = fs.statSync(expectedFilePath);
      console.log(`✅ PDF file confirmed - Size: ${stats.size} bytes`);
      
      res.status(200).json({
        message: 'Test PDF album generated successfully!',
        data: {
          ...result,
          diagnosis: {
            totalMissions: diagnosis.totalMissions,
            workingPhotos: diagnosis.working.length,
            problemPhotos: diagnosis.issues.length,
            availableFiles: diagnosis.availableFiles
          },
          fileInfo: {
            path: expectedFilePath,
            size: stats.size,
            exists: true
          }
        },
        debug: {
          staticDir: staticDir,
          expectedPath: expectedFilePath,
          urlPath: result.standardPdfUrl
        }
      });
    } else {
      console.error(`❌ PDF file not found at expected location: ${expectedFilePath}`);
      
      // Try to find the file in other locations
      const searchPaths = [
        path.join(__dirname, '..', 'uploads', 'albums', 'standard'),
        path.join(__dirname, '..', '..', 'uploads', 'albums', 'standard'),
        path.join(process.cwd(), 'uploads', 'albums', 'standard'),
        path.join(process.cwd(), 'public', 'uploads', 'albums', 'standard')
      ];

      console.log('🔍 Searching for PDF in alternative locations...');
      for (const searchPath of searchPaths) {
        if (fs.existsSync(searchPath)) {
          console.log(`📁 Directory exists: ${searchPath}`);
          const files = fs.readdirSync(searchPath);
          console.log(`📄 Files in directory:`, files);
          
          const pdfFiles = files.filter(f => f.endsWith('.pdf'));
          if (pdfFiles.length > 0) {
            console.log(`✅ Found PDFs:`, pdfFiles);
          }
        } else {
          console.log(`❌ Directory not found: ${searchPath}`);
        }
      }

      res.status(500).json({
        message: 'PDF generated but file not found at expected location',
        data: result,
        diagnosis,
        error: {
          expectedPath: expectedFilePath,
          searchedPaths: searchPaths
        }
      });
    }

  } catch (error) {
    console.error('❌ Error generating test album:', error);
    res.status(500).json({
      message: 'Failed to generate album manually',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// ✅ NEW: List available photos in mission-photos directory
exports.listAvailablePhotos = async (req, res) => {
  try {
    const missionPhotosDir = path.join(__dirname, '..', 'uploads', 'mission-photos');
    
    if (!fs.existsSync(missionPhotosDir)) {
      return res.status(404).json({
        message: 'Mission photos directory not found',
        path: missionPhotosDir
      });
    }

    const files = fs.readdirSync(missionPhotosDir);
    const photoFiles = files.filter(f => 
      f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png') || f.endsWith('.gif')
    );

    const photoDetails = photoFiles.map(file => {
      const filePath = path.join(missionPhotosDir, file);
      const stats = fs.statSync(filePath);
      
      return {
        filename: file,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        url: `/uploads/mission-photos/${file}`
      };
    });

    res.status(200).json({
      message: 'Available photos listed',
      directory: missionPhotosDir,
      totalFiles: files.length,
      photoFiles: photoFiles.length,
      otherFiles: files.length - photoFiles.length,
      photos: photoDetails.sort((a, b) => b.modified - a.modified) // Most recent first
    });

  } catch (error) {
    console.error('❌ Error listing photos:', error);
    res.status(500).json({
      message: 'Failed to list photos',
      error: error.message
    });
  }
};

// ✅ NEW: Test photo path resolution
exports.testPhotoPath = async (req, res) => {
  try {
    const { tripId } = req.params;
    
    // Get the mission with photo
    const mission = await prisma.assignedMission.findFirst({
      where: { 
        tripId,
        completed: true,
        photoUrl: { not: null }
      },
      include: { 
        user: { select: { displayName: true } },
        missionTemplate: { select: { title: true } }
      }
    });

    if (!mission) {
      return res.status(404).json({
        message: 'No mission with photo found for this trip',
        tripId
      });
    }

    // Test path resolution
    const photoUrl = mission.photoUrl;
    console.log(`🧪 Testing path resolution for: ${photoUrl}`);
    
    // Manual path construction for verification
    const manualPath = path.join(__dirname, '..', 'uploads', photoUrl.replace('/uploads/', ''));
    const manualExists = fs.existsSync(manualPath);
    
    // Test our resolution function
    const resolvedPath = albumService.resolvePhotoPath(photoUrl);

    // Get file info if it exists
    let fileInfo = null;
    if (manualExists) {
      const stats = fs.statSync(manualPath);
      fileInfo = {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        isFile: stats.isFile()
      };
    }

    res.status(200).json({
      message: 'Photo path resolution test',
      tripId,
      mission: {
        id: mission.id,
        title: mission.missionTemplate?.title || 'Untitled Mission',
        photoUrl: mission.photoUrl,
        submittedBy: mission.user.displayName
      },
      pathResolution: {
        originalUrl: photoUrl,
        manualPath,
        manualExists,
        resolvedPath,
        fileInfo
      },
      accessibleUrl: `http://localhost:5000${photoUrl}`,
      recommendation: manualExists ? 
        'Photo should work in PDF generation' : 
        'Photo file is missing - check file system'
    });

  } catch (error) {
    console.error('❌ Error testing photo path:', error);
    res.status(500).json({
      message: 'Failed to test photo path',
      error: error.message
    });
  }
};

// ✅ NEW: Fix photo URLs for a specific trip
exports.fixPhotoUrls = async (req, res) => {
  try {
    const { tripId } = req.params;

    console.log(`🔧 Starting photo URL fix for trip: ${tripId}`);

    // Verify trip exists
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true, name: true }
    });

    if (!trip) {
      return res.status(404).json({
        message: 'Trip not found',
        tripId
      });
    }

    // Get missions with photo issues
    const missions = await prisma.assignedMission.findMany({
      where: { 
        tripId,
        completed: true,
        photoUrl: { not: null }
      },
      include: { 
        user: { select: { displayName: true } },
        missionTemplate: { select: { title: true } }
      }
    });

    const missionPhotosDir = path.join(__dirname, '..', 'uploads', 'mission-photos');
    const availableFiles = fs.existsSync(missionPhotosDir) 
      ? fs.readdirSync(missionPhotosDir).filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png'))
      : [];

    let fixedCount = 0;
    const fixes = [];
    const unfixable = [];

    for (const mission of missions) {
      console.log(`🔍 Checking mission: ${mission.missionTemplate?.title || 'Untitled Mission'}`);
      
      // Check if current URL works
      if (mission.photoUrl) {
        const currentPath = path.join(missionPhotosDir, path.basename(mission.photoUrl));
        
        if (fs.existsSync(currentPath)) {
          console.log(`✅ Photo already working: ${mission.missionTemplate?.title || 'Untitled Mission'}`);
          continue;
        }
      }

      // Try to find a matching file
      const missionDate = new Date(mission.submittedAt);
      const timeWindow = 10 * 60 * 1000; // 10 minutes
      
      let foundMatch = null;
      
      for (const file of availableFiles) {
        const filePath = path.join(missionPhotosDir, file);
        const stats = fs.statSync(filePath);
        const timeDiff = Math.abs(stats.mtime.getTime() - missionDate.getTime());
        
        // Also check created time
        const createTimeDiff = Math.abs(stats.birthtime.getTime() - missionDate.getTime());
        
        if (timeDiff < timeWindow || createTimeDiff < timeWindow) {
          foundMatch = file;
          console.log(`🎯 Found potential match for "${mission.missionTemplate?.title || 'Untitled Mission'}": ${file} (time diff: ${Math.round(Math.min(timeDiff, createTimeDiff) / 1000)}s)`);
          break;
        }
      }

      if (foundMatch) {
        const newUrl = `/uploads/mission-photos/${foundMatch}`;
        
        await prisma.assignedMission.update({
          where: { id: mission.id },
          data: { photoUrl: newUrl }
        });

        fixes.push({
          missionId: mission.id,
          title: mission.missionTemplate?.title || 'Untitled Mission',
          oldUrl: mission.photoUrl,
          newUrl,
          submittedBy: mission.user.displayName
        });
        
        fixedCount++;
        
        // Remove the file from available list to avoid double-matching
        const index = availableFiles.indexOf(foundMatch);
        if (index > -1) {
          availableFiles.splice(index, 1);
        }
      } else {
        unfixable.push({
          missionId: mission.id,
          title: mission.missionTemplate?.title || 'Untitled Mission',
          originalUrl: mission.photoUrl,
          submittedBy: mission.user.displayName,
          submittedAt: mission.submittedAt
        });
      }
    }

    res.status(200).json({
      message: `Photo URL fix complete for trip "${trip.name}"`,
      tripId,
      summary: {
        totalMissions: missions.length,
        fixed: fixedCount,
        unfixable: unfixable.length,
        remainingFiles: availableFiles.length
      },
      fixes,
      unfixable: unfixable.length > 0 ? unfixable : undefined,
      remainingFiles: availableFiles.length > 0 ? availableFiles : undefined
    });

  } catch (error) {
    console.error('❌ Error fixing photo URLs:', error);
    res.status(500).json({
      message: 'Failed to fix photo URLs',
      error: error.message
    });
  }
};

// Get album access information
exports.getAlbumAccess = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { tripId } = req.params;

    const albumAccess = await albumService.getAlbumAccess(tripId, userId);
    const paymentInfo = await paymentService.getTripPaymentInfo(tripId);

    successResponse(res, 200, 'Album access information retrieved', {
      ...albumAccess,
      paymentInfo
    });
  } catch (err) {
    next(err);
  }
};



// Get trip photos for album preview
exports.getTripPhotos = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { tripId } = req.params;

    // Verify access
    const trip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        members: { some: { id: userId } }
      }
    });

    if (!trip) {
      return errorResponse(res, 403, 'Access denied to this trip due to you are not member of this trip!!');
    }

    const photos = await missionPhotoService.getTripPhotos(tripId);
    
    successResponse(res, 200, 'Trip photos retrieved', {
      photos,
      totalPhotos: photos.length,
      tripName: trip.name
    });
  } catch (err) {
    next(err);
  }
};


exports.getTripAlbumOverview = async (req, res) => {
  try {
    const { tripId } = req.params;
    const userId = req.user.id;

    console.log(`📱 Getting trip album overview for trip: ${tripId}, user: ${userId}`);

    // Get trip details with missions and album info
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        members: { 
          where: { id: userId },
          select: { id: true, displayName: true }
        },
        tripAliases: {
          where: { userId },
          select: { alias: true }
        },
        assignedMissions: {
          where: { 
            completed: true, 
            photoUrl: { not: null },
            userId // Only user's missions
          },
          include: { 
            missionTemplate: { 
              select: { title: true, instruction: true, category: true }
            }
          },
          orderBy: { submittedAt: 'asc' }
        },
        album: true
      }
    });

    if (!trip) {
      return res.status(404).json({
        message: 'Trip not found or access denied',
        tripId
      });
    }

    // Check if user is a member
    if (trip.members.length === 0) {
      return res.status(403).json({
        message: 'Access denied - you are not a member of this trip',
        tripId
      });
    }

    // Get all completed missions for photo count (from all users)
    const allCompletedMissions = await prisma.assignedMission.count({
      where: {
        tripId,
        completed: true,
        photoUrl: { not: null }
      }
    });

    // ✅ Get the first mission photo as album cover image
    const firstMissionWithPhoto = await prisma.assignedMission.findFirst({
      where: {
        tripId,
        completed: true,
        photoUrl: { not: null }
      },
      select: {
        photoUrl: true,
        thumbnailUrl: true,
        submittedAt: true,
        user: { select: { displayName: true } },
        missionTemplate: { select: { title: true } }
      },
      orderBy: { submittedAt: 'asc' } // Get the earliest submitted photo
    });

    // Get payment info for HD access
    const paymentInfo = await paymentService.getTripPaymentInfo(tripId);
    const hasHDAccess = paymentInfo?.hasHDAccess || false;

    // Album availability
    const albumAvailable = Boolean(trip.album);
    const albumExpired = trip.album?.expiresAt ? 
      new Date() > new Date(trip.album.expiresAt) : false;

    // User's alias for this trip
    const userAlias = trip.tripAliases[0]?.alias || 'Agent';

    // Format response for mobile app
    const response = {
      trip: {
        id: trip.id,
        name: trip.name,
        location: trip.location,
        startDate: trip.startDate,
        endDate: trip.endDate,
        status: trip.status,
        dateRange: `${formatDate(trip.startDate)} - ${formatDate(trip.endDate)}`
      },
      album: {
        available: albumAvailable,
        expired: albumExpired,
        title: `${trip.name} Album`,
        subtitle: `${trip.name} Memories`,
        totalPhotos: allCompletedMissions,
        userPhotos: trip.assignedMissions.length,
        totalMissions: allCompletedMissions,
        createdAt: trip.album?.createdAt,
        expiresAt: trip.album?.expiresAt,
        canPreview: albumAvailable && !albumExpired,
        canDownloadSD: albumAvailable && !albumExpired,
        canDownloadHD: hasHDAccess,
        // ✅ Add cover image (first mission photo)
        coverImage: firstMissionWithPhoto ? {
          photoUrl: firstMissionWithPhoto.photoUrl,
          thumbnailUrl: firstMissionWithPhoto.thumbnailUrl || firstMissionWithPhoto.photoUrl,
          missionTitle: firstMissionWithPhoto.missionTemplate?.title || 'Mission Photo',
          submittedBy: firstMissionWithPhoto.user.displayName,
          submittedAt: firstMissionWithPhoto.submittedAt
        } : null
      },
      user: {
        alias: userAlias,
        displayName: trip.members[0].displayName
      },
      payment: {
        hasHDAccess,
        hdPrice: 4.99,
        currency: 'EUR',
        canUpgrade: albumAvailable && !hasHDAccess
      },
      actions: {
        previewAvailable: albumAvailable && !albumExpired,
        downloadSDAvailable: albumAvailable && !albumExpired,
        downloadHDAvailable: hasHDAccess,
        upgradeAvailable: albumAvailable && !hasHDAccess,
        printOrderAvailable: true // Always available as a service
      }
    };

    res.status(200).json({
      message: 'Trip album overview retrieved successfully',
      data: response
    });

  } catch (error) {
    console.error('❌ Error getting trip album overview:', error);
    res.status(500).json({
      message: 'Failed to get trip album overview',
      error: error.message
    });
  }
};

// ✅ CONTROLLER 2: Album Preview (Screen 17)
// GET /api/trip-albums/:tripId/preview
exports.getAlbumPreview = async (req, res) => {
  try {
    const { tripId } = req.params;
    const userId = req.user.id;

    console.log(`📱 Getting album preview for trip: ${tripId}, user: ${userId}`);

    // Verify user access to trip
    const trip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        members: { some: { id: userId } }
      },
      select: {
        id: true,
        name: true,
        album: true
      }
    });

    if (!trip) {
      return res.status(404).json({
        message: 'Trip not found or access denied',
        tripId
      });
    }

    // Check album availability
    if (!trip.album) {
      return res.status(404).json({
        message: 'Album not available yet',
        suggestion: 'Album is still being generated'
      });
    }

    const albumExpired = trip.album.expiresAt ? 
      new Date() > new Date(trip.album.expiresAt) : false;

    if (albumExpired) {
      return res.status(403).json({
        message: 'Free album access has expired',
        suggestion: 'Upgrade to HD to access the album'
      });
    }

    // Get all mission photos for preview
    const missionPhotos = await prisma.assignedMission.findMany({
      where: {
        tripId,
        completed: true,
        photoUrl: { not: null }
      },
      include: {
        user: { 
          select: { displayName: true } 
        },
        missionTemplate: { 
          select: { title: true, instruction: true, category: true }
        },
        trip: {
          include: {
            tripAliases: {
              where: { userId: prisma.assignedMission.fields.userId },
              select: { alias: true }
            }
          }
        }
      },
      orderBy: { submittedAt: 'asc' }
    });

    // Get payment info
    const paymentInfo = await paymentService.getTripPaymentInfo(tripId);
    const hasHDAccess = paymentInfo?.hasHDAccess || false;

    // Format photos for mobile display
    const formattedPhotos = missionPhotos.map((mission, index) => ({
      id: mission.id,
      photoUrl: mission.photoUrl,
      thumbnailUrl: mission.thumbnailUrl || mission.photoUrl,
      caption: mission.caption,
      missionTitle: mission.missionTemplate?.title || 'Mission Photo',
      missionInstruction: mission.missionTemplate?.instruction,
      category: mission.missionTemplate?.category,
      submittedBy: mission.user.displayName,
      submittedAt: mission.submittedAt,
      dayAssigned: mission.dayAssigned,
      order: index + 1
    }));

    const response = {
      album: {
        id: trip.album.id,
        tripId: trip.id,
        tripName: trip.name,
        title: 'Preview Album',
        totalPhotos: formattedPhotos.length,
        canDownload: true,
        expiresAt: trip.album.expiresAt
      },
      photos: formattedPhotos,
      payment: {
        hasHDAccess,
        hdPrice: 4.99,
        currency: 'EUR',
        canUpgrade: !hasHDAccess
      },
      downloads: {
        standardPdfUrl: hasHDAccess ? null : `/api/trip-albums/${tripId}/download?quality=standard`,
        hdPdfUrl: hasHDAccess ? `/api/trip-albums/${tripId}/download?quality=hd` : null,
        message: hasHDAccess ? 
          'You have HD access - premium quality download available' : 
          'Standard quality preview available - upgrade for HD'
      }
    };

    res.status(200).json({
      message: 'Album preview retrieved successfully',
      data: response
    });

  } catch (error) {
    console.error('❌ Error getting album preview:', error);
    res.status(500).json({
      message: 'Failed to get album preview',
      error: error.message
    });
  }
};

// ✅ DOWNLOAD CONTROLLER: Download Album PDF
// GET /api/trip-albums/:tripId/download?quality=standard|hd
exports.downloadAlbumPDF = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { quality = 'standard' } = req.query;
    const userId = req.user.id;

    console.log(`📱 Download request - Trip: ${tripId}, Quality: ${quality}, User: ${userId}`);

    // Verify access
    const albumAccess = await albumService.getAlbumAccess(tripId, userId);
    
    if (!albumAccess.available) {
      return res.status(404).json({
        message: 'Album not available',
        code: 'ALBUM_NOT_AVAILABLE'
      });
    }

    // Check access permissions
    if (quality === 'hd') {
      if (!albumAccess.hasHDAccess) {
        return res.status(403).json({
          message: 'HD access not purchased',
          code: 'HD_ACCESS_REQUIRED',
          upgradeUrl: `/api/payments/trips/${tripId}/upgrade-hd`
        });
      }
    } else {
      if (albumAccess.freeAccessExpired) {
        return res.status(403).json({
          message: 'Free access has expired. Please upgrade to HD.',
          code: 'FREE_ACCESS_EXPIRED',
          upgradeUrl: `/api/payments/trips/${tripId}/upgrade-hd`
        });
      }
    }

    // Get download URL
    let downloadUrl;
    if (quality === 'hd') {
      downloadUrl = albumAccess.hdPdfUrl;
      
      // Generate HD version if not exists
      if (!downloadUrl) {
        console.log('🔄 Generating HD version...');
        downloadUrl = await albumService.generateHDVersion(albumAccess.albumId);
      }
    } else {
      downloadUrl = albumAccess.standardPdfUrl;
    }

    if (!downloadUrl) {
      return res.status(404).json({
        message: 'Album file not found',
        code: 'FILE_NOT_FOUND'
      });
    }

    // For mobile app, return download info instead of file stream
    res.status(200).json({
      message: 'Download ready',
      data: {
        downloadUrl,
        quality,
        expiresAt: quality === 'standard' ? albumAccess.expiresAt : null,
        fileInfo: {
          type: 'application/pdf',
          quality: quality.toUpperCase(),
          description: `${quality === 'hd' ? 'High Definition' : 'Standard Quality'} PDF Album`
        }
      }
    });

  } catch (error) {
    console.error('❌ Error downloading album:', error);
    res.status(500).json({
      message: 'Failed to prepare download',
      error: error.message
    });
  }
};

// ✅ UPGRADE CONTROLLER: Initiate HD Upgrade
// POST /api/trip-albums/:tripId/upgrade-hd
exports.initiateHDUpgrade = async (req, res) => {
  try {
    const { tripId } = req.params;
    const userId = req.user.id;

    console.log(`💳 HD upgrade request - Trip: ${tripId}, User: ${userId}`);

    // Verify trip access
    const trip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        members: { some: { id: userId } }
      },
      select: { id: true, name: true }
    });

    if (!trip) {
      return res.status(404).json({
        message: 'Trip not found or access denied'
      });
    }

    // Check if already has HD access
    const paymentInfo = await paymentService.getTripPaymentInfo(tripId);
    if (paymentInfo?.hasHDAccess) {
      return res.status(400).json({
        message: 'HD access already purchased',
        code: 'ALREADY_PURCHASED'
      });
    }

    // Create payment intent (you'll need to implement this in paymentService)
    const paymentIntent = await paymentService.createHDUpgradePayment({
      userId,
      tripId,
      amount: 499, // €4.99 in cents
      currency: 'EUR',
      description: `HD Album Upgrade - ${trip.name}`
    });

    res.status(200).json({
      message: 'HD upgrade payment initiated',
      data: {
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        amount: 499,
        currency: 'EUR',
        description: `HD Album Upgrade - ${trip.name}`
      }
    });

  } catch (error) {
    console.error('❌ Error initiating HD upgrade:', error);
    res.status(500).json({
      message: 'Failed to initiate HD upgrade',
      error: error.message
    });
  }
};

// ✅ STATUS CONTROLLER: Check Album Generation Status
// GET /api/trip-albums/:tripId/status
exports.getAlbumStatus = async (req, res) => {
  try {
    const { tripId } = req.params;
    const userId = req.user.id;

    // Verify access
    const trip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        members: { some: { id: userId } }
      },
      include: {
        album: true,
        assignedMissions: {
          where: { 
            completed: true, 
            photoUrl: { not: null }
          }
        }
      }
    });

    if (!trip) {
      return res.status(404).json({
        message: 'Trip not found or access denied'
      });
    }

    const albumStatus = {
      available: Boolean(trip.album),
      generating: false, // You might want to add a status field to track this
      completedMissions: trip.assignedMissions.length,
      estimatedTime: trip.assignedMissions.length > 0 ? 
        `${Math.ceil(trip.assignedMissions.length / 2)} minutes` : null,
      lastUpdated: trip.album?.updatedAt
    };

    // If no album and there are completed missions, trigger generation
    if (!trip.album && trip.assignedMissions.length > 0) {
      // Trigger album generation in background
      albumService.generateTripAlbum(tripId)
        .then(() => console.log(`✅ Album generated for trip ${tripId}`))
        .catch(err => console.error(`❌ Album generation failed for trip ${tripId}:`, err));
      
      albumStatus.generating = true;
      albumStatus.message = 'Album generation started - check back in a few minutes';
    }

    res.status(200).json({
      message: 'Album status retrieved',
      data: albumStatus
    });

  } catch (error) {
    console.error('❌ Error getting album status:', error);
    res.status(500).json({
      message: 'Failed to get album status',
      error: error.message
    });
  }
};