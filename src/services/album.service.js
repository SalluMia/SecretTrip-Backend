// src/services/album.service.js - COMPLETE FIXED VERSION
const { prisma } = require('../config/prisma');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

const notificationService = require('./notification.service');
const { formatDate } = require('../utils/dateUtils');

// ✅ IMPROVED: Better path handling and error checking
function initializeDirectories() {
  const staticDir = path.join(__dirname, '..', 'uploads');
  const dirs = [
    staticDir,
    path.join(staticDir, 'albums'),
    path.join(staticDir, 'albums', 'standard'),
    path.join(staticDir, 'albums', 'hd'),
    path.join(staticDir, 'mission-photos'),
    path.join(staticDir, 'mission-photos', 'thumbnails')
  ];

  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      console.log(`📁 Creating directory: ${dir}`);
      fs.mkdirSync(dir, { recursive: true });
    } else {
      console.log(`✅ Directory exists: ${dir}`);
    }
  });
}

// Initialize directories on module load
initializeDirectories();

// ✅ FIXED: Complete photo path resolution function
function resolvePhotoPath(photoUrl) {
  console.log(`🔍 Resolving photo path for URL: ${photoUrl}`);
  
  if (!photoUrl) {
    console.log('❌ No photo URL provided');
    return null;
  }

  // Clean the URL - remove any query parameters or fragments
  const cleanUrl = photoUrl.split('?')[0].split('#')[0];
  
  let photoPath;
  
  if (cleanUrl.startsWith('http')) {
    // Extract path from full URL: http://localhost:5000/uploads/mission-photos/image.jpg
    const urlParts = cleanUrl.split('/uploads/');
    if (urlParts.length > 1) {
      photoPath = path.join(__dirname, '..', 'uploads', urlParts[1]);
    } else {
      console.log('❌ Could not extract path from URL');
      return null;
    }
  } else if (cleanUrl.startsWith('/uploads/')) {
    // Handle absolute path: /uploads/mission-photos/image.jpg
    // Remove the leading slash and join with the base uploads directory
    const relativePath = cleanUrl.substring(9); // Remove '/uploads/' (9 characters)
    photoPath = path.join(__dirname, '..', 'uploads', relativePath);
  } else if (cleanUrl.startsWith('uploads/')) {
    // Handle relative path: uploads/mission-photos/image.jpg
    photoPath = path.join(__dirname, '..', cleanUrl);
  } else {
    // Assume it's just the filename in mission-photos
    photoPath = path.join(__dirname, '..', 'uploads', 'mission-photos', cleanUrl);
  }

  // Normalize the path to handle any path separators correctly
  photoPath = path.normalize(photoPath);
  
  console.log(`📍 Resolved photo path: ${photoPath}`);
  
  // Check if file exists
  const exists = fs.existsSync(photoPath);
  console.log(`✅ Photo exists: ${exists}`);
  
  if (exists) {
    // Verify it's actually a readable image file
    try {
      const stats = fs.statSync(photoPath);
      if (stats.size === 0) {
        console.log('❌ Image file is empty');
        return null;
      }
      console.log(`📊 Image file size: ${stats.size} bytes`);
      return photoPath;
    } catch (error) {
      console.log(`❌ Error reading image file: ${error.message}`);
      return null;
    }
  }
  
  // If exact file doesn't exist, try to find alternatives
  console.log('🔍 Trying to find alternative photo...');
  const alternatives = findAlternativePhotoPath(photoPath);
  if (alternatives) {
    console.log(`🔄 Found alternative photo: ${alternatives}`);
    return alternatives;
  }
  
  return null;
}

// ✅ NEW: Function to find alternative photo paths if exact match fails
function findAlternativePhotoPath(originalPath) {
  try {
    const missionPhotosDir = path.join(__dirname, '..', 'uploads', 'mission-photos');
    const originalFilename = path.basename(originalPath);
    
    if (!fs.existsSync(missionPhotosDir)) {
      console.log(`❌ Mission photos directory not found: ${missionPhotosDir}`);
      return null;
    }

    const files = fs.readdirSync(missionPhotosDir);
    console.log(`📁 Searching in ${files.length} files for alternatives to: ${originalFilename}`);

    // First, try exact filename match (case-insensitive)
    const exactMatch = files.find(file => 
      file.toLowerCase() === originalFilename.toLowerCase()
    );
    
    if (exactMatch) {
      const alternatePath = path.join(missionPhotosDir, exactMatch);
      console.log(`✅ Found case-insensitive match: ${alternatePath}`);
      return alternatePath;
    }

    // Try to match by base UUID (first part before timestamp)
    const originalParts = originalFilename.split('_');
    if (originalParts.length >= 2) {
      const baseUuid = originalParts[0];
      const similarFile = files.find(file => file.startsWith(baseUuid));
      
      if (similarFile) {
        const alternatePath = path.join(missionPhotosDir, similarFile);
        console.log(`🔄 Found similar file by UUID: ${alternatePath}`);
        return alternatePath;
      }
    }

    // Try to match by removing "_processed" suffix
    const withoutProcessed = originalFilename.replace('_processed', '');
    const withoutProcessedMatch = files.find(file => 
      file === withoutProcessed || file === withoutProcessed.replace('.jpg', '_processed.jpg')
    );
    
    if (withoutProcessedMatch) {
      const alternatePath = path.join(missionPhotosDir, withoutProcessedMatch);
      console.log(`🔄 Found match without '_processed': ${alternatePath}`);
      return alternatePath;
    }

    console.log(`❌ No alternative found for: ${originalFilename}`);
    return null;
    
  } catch (error) {
    console.error('❌ Error finding alternative photo path:', error);
    return null;
  }
}

// ✅ NEW: Function to validate and clean photo URLs in database
async function validateAndCleanPhotoUrls(tripId) {
  try {
    console.log(`🧹 Validating photo URLs for trip: ${tripId}`);
    
    const missions = await prisma.assignedMission.findMany({
      where: { 
        tripId,
        completed: true,
        photoUrl: { not: null }
      }
    });

    let fixedCount = 0;
    const unfixableUrls = [];

    for (const mission of missions) {
      const currentPath = resolvePhotoPath(mission.photoUrl);
      
      if (!currentPath) {
        // Try to find the correct file
        const missionPhotosDir = path.join(__dirname, '..', 'uploads', 'mission-photos');
        const files = fs.readdirSync(missionPhotosDir).filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png'));
        
        // Look for files created around the same time as the mission
        const missionDate = new Date(mission.submittedAt);
        const timeWindow = 5 * 60 * 1000; // 5 minutes
        
        for (const file of files) {
          const filePath = path.join(missionPhotosDir, file);
          const stats = fs.statSync(filePath);
          const timeDiff = Math.abs(stats.mtime.getTime() - missionDate.getTime());
          
          if (timeDiff < timeWindow) {
            console.log(`🔄 Found potential match for mission ${mission.id}: ${file}`);
            
            // Update the database with the correct URL
            await prisma.assignedMission.update({
              where: { id: mission.id },
              data: { photoUrl: `/uploads/mission-photos/${file}` }
            });
            
            fixedCount++;
            break;
          }
        }
        
        if (!currentPath) {
          unfixableUrls.push({
            missionId: mission.id,
            originalUrl: mission.photoUrl,
            title: mission.title
          });
        }
      }
    }

    console.log(`✅ Photo URL validation complete. Fixed: ${fixedCount}, Unfixable: ${unfixableUrls.length}`);
    
    if (unfixableUrls.length > 0) {
      console.log(`❌ Unfixable photo URLs:`, unfixableUrls);
    }

    return { fixedCount, unfixableUrls };
    
  } catch (error) {
    console.error('❌ Error validating photo URLs:', error);
    return { fixedCount: 0, unfixableUrls: [] };
  }
}

// ✅ IMPROVED: Generate trip album with better photo handling
exports.generateTripAlbum = async function(tripId) {
  try {
    console.log(`📸 Generating album for trip ${tripId}...`);

    // First, try to validate and fix photo URLs
    await validateAndCleanPhotoUrls(tripId);

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        members: { select: { id: true, displayName: true } },
        tripAliases: true,
        assignedMissions: {
          where: { completed: true, photoUrl: { not: null } },
          include: { 
            user: { select: { displayName: true } },
            missionTemplate: { select: { title: true, instruction: true } }
          },
          orderBy: { submittedAt: 'asc' }
        }
      }
    });

    if (!trip) throw new Error('Trip not found');
    if (trip.assignedMissions.length === 0) throw new Error('No completed missions with photos found');

    const { filePath: standardPdfPath, urlPath: standardPdfUrl } = await exports.createPDF(trip, 'standard');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const existingAlbum = await prisma.album.findUnique({
      where: { tripId }
    });

    let album;

    if (existingAlbum) {
      album = await prisma.album.update({
        where: { tripId },
        data: {
          pdfUrl: standardPdfUrl,
          expiresAt,
          updatedAt: new Date()
        }
      });
      console.log('♻️ Existing album updated.');
    } else {
      album = await prisma.album.create({
        data: {
          tripId: trip.id,
          pdfUrl: standardPdfUrl,
          expiresAt,
          createdAt: new Date()
        }
      });
      console.log('✅ New album created.');
    }

    // Send notifications
    for (const member of trip.members) {
      const alias = trip.tripAliases.find(ta => ta.userId === member.id)?.alias || 'Agent';
      try {
        await notificationService.sendAlbumReadyNotification({
          userId: member.id,
          tripName: trip.name,
          alias,
          albumId: album.id
        });
      } catch (notifError) {
        console.error('⚠️ Failed to send album notification:', notifError);
      }
    }

    console.log(`📁 Album available for trip "${trip.name}"`);

    return {
      albumId: album.id,
      standardPdfUrl: album.pdfUrl,
      photoCount: trip.assignedMissions.length,
      expiresAt: album.expiresAt
    };

  } catch (error) {
    console.error('❌ Error generating trip album:', error);
    throw error;
  }
};

// ✅ IMPROVED: Create PDF with better photo handling and fallbacks
exports.createPDF = async (trip, quality = 'standard') => {
  try {
    console.log(`🚀 Starting PDF creation for trip ${trip.id}, quality: ${quality}`);
    
    const fileName = `album_${trip.id}_${quality}_${Date.now()}.pdf`;
    const staticDir = path.join(__dirname, '..', 'uploads');
    const uploadsDir = path.join(staticDir, 'albums', quality);
    const filePath = path.join(uploadsDir, fileName);
    const urlPath = `/uploads/albums/${quality}/${fileName}`;

    console.log(`📁 Target directory: ${uploadsDir}`);
    console.log(`📄 Full file path: ${filePath}`);
    console.log(`🔗 URL path: ${urlPath}`);

    if (!fs.existsSync(uploadsDir)) {
      console.log(`📁 Creating directory: ${uploadsDir}`);
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const doc = new PDFDocument({ margin: 50 });
    const writeStream = fs.createWriteStream(filePath);
    
    writeStream.on('error', (error) => {
      console.error('❌ Write stream error:', error);
      throw error;
    });

    doc.pipe(writeStream);

    // Cover page
    doc
      .fontSize(22).font('Helvetica-Bold').text('SECRET TRIP', { align: 'center' })
      .moveDown()
      .fontSize(18).text(trip.name, { align: 'center' })
      .moveDown()
      .fontSize(12)
      .text(`${formatDate(trip.startDate)}  –  ${formatDate(trip.endDate)}`, { align: 'center' })
      .moveDown()
      .fontSize(11)
      .text(`Completed missions: ${trip.assignedMissions.length}`, { align: 'center' })
      .text(`Participating agents: ${trip.members.length}`, { align: 'center' })
      // .addPage();

    // Mission photos with improved handling
    let successfulPhotos = 0;
    let skippedPhotos = 0;

    for (const mission of trip.assignedMissions) {
      console.log(`\n🎯 Processing mission: ${mission.missionTemplate?.title || 'Untitled Mission'}`);
      console.log(`📸 Original photo URL: ${mission.photoUrl}`);
      
      const photoPath = resolvePhotoPath(mission.photoUrl);
      
      // Add mission info to PDF
      doc.fontSize(14).font('Helvetica-Bold').text(mission.missionTemplate?.title || 'Mission Photo');
      doc.moveDown(0.4).fontSize(10).font('Helvetica').text(mission.missionTemplate?.instruction || 'Photo submitted by agent');
      doc.moveDown(0.6);

      if (photoPath) {
        try {
          console.log(`✅ Adding photo to PDF: ${photoPath}`);
          
          // Additional validation before adding to PDF
          const stats = fs.statSync(photoPath);
          console.log(`📊 Image file info: ${stats.size} bytes, modified: ${stats.mtime}`);
          
          if (stats.size === 0) {
            throw new Error('Image file is empty');
          }

          // Add image to PDF with error handling
          try {
            doc.image(photoPath, { 
              fit: [450, 320], 
              align: 'center',
              valign: 'center'
            });
            console.log(`✅ Successfully added image to PDF`);
            successfulPhotos++;
          } catch (pdfImageError) {
            console.error(`❌ PDFKit image error:`, pdfImageError.message);
            // Show error message in PDF instead of crashing
            doc.fontSize(10).fillColor('#FF6B6B').text(`❌ Image could not be displayed: ${pdfImageError.message}`);
            skippedPhotos++;
          }
          
        } catch (imageError) {
          console.error(`⚠️ Error processing image ${photoPath}:`, imageError.message);
          doc.fontSize(10).fillColor('#888').text('📷 Photo could not be loaded - file may be corrupted');
          skippedPhotos++;
        }
      } else {
        console.warn(`⚠️ Photo not found for mission: ${mission.missionTemplate?.title}`);
        
        // Show debug info in the PDF
        doc.fontSize(10).fillColor('#888').text('📷 Photo not available');
        
        // Add debug info for developers
        if (process.env.NODE_ENV === 'development') {
          doc.fontSize(8).fillColor('#CCC').text(`Debug: URL was "${mission.photoUrl}"`);
        }
        
        skippedPhotos++;
        
        // Log available files for debugging
        const missionPhotosDir = path.join(__dirname, '..', 'uploads', 'mission-photos');
        if (fs.existsSync(missionPhotosDir)) {
          const files = fs.readdirSync(missionPhotosDir).filter(f => 
            f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png')
          );
          console.log(`📁 Available photos (${files.length}):`, files.slice(0, 3).join(', ') + (files.length > 3 ? '...' : ''));
        }
      }

      // Add mission metadata
      doc.moveDown(0.4)
         .fontSize(9)
         .fillColor('#555')
         .text(`By ${mission.user.displayName} • ${formatDate(mission.submittedAt)}`);

      if (mission.caption) {
        doc.moveDown(0.3).fontSize(10).fillColor('#333').text(`"${mission.caption}"`);
      }
      
      // Add page break (except for last mission)
      const isLastMission = trip.assignedMissions.indexOf(mission) === trip.assignedMissions.length - 1;
      if (!isLastMission) {
        doc.addPage();
      }
    }

    // Summary page with photo statistics (only add if there were missions)
    if (trip.assignedMissions.length > 0) {
      doc.addPage();
    }

    doc
      .fontSize(18).font('Helvetica-Bold').text('MISSION SUMMARY', { align: 'center' })
      .moveDown()
      .fontSize(12).font('Helvetica')
      .text(`✅ Photos successfully included: ${successfulPhotos}`, { align: 'center' })
      .text(`⚠️ Photos unavailable: ${skippedPhotos}`, { align: 'center' })
      .text(`📋 Total missions: ${trip.assignedMissions.length}`, { align: 'center' })
      .moveDown(2);

    // Thank you page
    doc
      .fontSize(18).font('Helvetica-Bold').text('THANK YOU', { align: 'center' })
      .moveDown()
      .fontSize(12).font('Helvetica')
      .text(
        'Thanks to all agents who took part in this secret mission! Every photo tells a story, every completed task strengthens the team and creates unforgettable memories.',
        { align: 'center' }
      )
      .moveDown(1)
      .fontSize(10)
      .text(`Generated on ${formatDate(new Date())}`, { align: 'center' })
      .text('Secret Trip App • www.secrettrip.app', { align: 'center' });

    doc.end();

    await new Promise((resolve, reject) => {
      writeStream.on('finish', () => {
        console.log(`✅ PDF write stream finished`);
        resolve();
      });
      writeStream.on('error', reject);
    });

    if (!fs.existsSync(filePath)) {
      throw new Error(`PDF file was not created at: ${filePath}`);
    }

    const stats = fs.statSync(filePath);
    console.log(`📄 PDF created successfully at ${filePath}`);
    console.log(`📊 File size: ${stats.size} bytes`);
    console.log(`📸 Photo statistics: ${successfulPhotos} successful, ${skippedPhotos} skipped`);
    console.log(`🔗 URL: ${urlPath}`);

    return {
      filePath,
      urlPath,
      fileName,
      size: stats.size,
      photoStats: {
        successful: successfulPhotos,
        skipped: skippedPhotos,
        total: trip.assignedMissions.length
      }
    };

  } catch (error) {
    console.error('❌ Error in createPDF():', error);
    throw error;
  }
};

// ✅ NEW: Function to list and diagnose photo issues
exports.diagnoseMissionPhotos = async function(tripId) {
  try {
    console.log(`🔍 Diagnosing photo issues for trip: ${tripId}`);
    
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

    const diagnosis = {
      totalMissions: missions.length,
      availableFiles: availableFiles.length,
      issues: [],
      working: [],
      suggestions: []
    };

    for (const mission of missions) {
      const photoPath = resolvePhotoPath(mission.photoUrl);
      const issue = {
        missionId: mission.id,
        title: mission.missionTemplate?.title || 'Untitled Mission',
        photoUrl: mission.photoUrl,
        resolvedPath: photoPath,
        exists: photoPath ? fs.existsSync(photoPath) : false,
        submittedBy: mission.user.displayName,
        submittedAt: mission.submittedAt
      };

      if (issue.exists) {
        diagnosis.working.push(issue);
      } else {
        diagnosis.issues.push(issue);
      }
    }

    // Generate suggestions
    if (diagnosis.issues.length > 0) {
      diagnosis.suggestions.push("Some photo files are missing from the server.");
      diagnosis.suggestions.push("Check if files were moved or deleted from /uploads/mission-photos/");
      
      if (availableFiles.length > 0) {
        diagnosis.suggestions.push(`There are ${availableFiles.length} photos available in the directory - they may need to be matched to missions.`);
      }
    }

    console.log(`📊 Diagnosis complete:`, {
      working: diagnosis.working.length,
      issues: diagnosis.issues.length,
      availableFiles: diagnosis.availableFiles
    });

    return diagnosis;
    
  } catch (error) {
    console.error('❌ Error diagnosing mission photos:', error);
    throw error;
  }
};

// Keep existing functions...
exports.generateHDVersion = async function(albumId) {
  try {
    const album = await prisma.album.findUnique({
      where: { id: albumId },
      include: {
        trip: {
          include: {
            members: true,
            tripAliases: true,
            assignedMissions: {
              where: { completed: true, photoUrl: { not: null } },
              include: { 
                user: { select: { displayName: true } },
                missionTemplate: { select: { title: true, instruction: true } }
              },
              orderBy: { submittedAt: 'asc' }
            }
          }
        }
      }
    });

    if (!album) throw new Error('Album not found');
    if (album.pdfHDUrl) return album.pdfHDUrl;

    const { urlPath: hdPdfUrl } = await exports.createPDF(album.trip, 'hd');

    const updatedAlbum = await prisma.album.update({
      where: { id: albumId },
      data: {
        pdfHDUrl: hdPdfUrl
      }
    });

    return updatedAlbum.pdfHDUrl;
  } catch (error) {
    console.error('Error generating HD version:', error);
    throw error;
  }
};

exports.getAlbumAccess = async function(tripId, userId) {
  const trip = await prisma.trip.findFirst({
    where: {
      id: tripId,
      // members: { some: { id: userId } }
    }
  });

  if (!trip) throw new Error('Trip not found or access denied');

  const album = await prisma.album.findUnique({ where: { tripId } });

  if (!album) {
    return { available: false, message: 'Album is being generated...' };
  }

  const now = new Date();
  const hasHDAccess = Boolean(album.pdfHDUrl);
  const freeAccessExpired = album.expiresAt && now > album.expiresAt;

  return {
    available: true,
    albumId: album.id,
    standardPdfUrl: freeAccessExpired ? null : album.pdfUrl,
    hdPdfUrl: hasHDAccess ? album.pdfHDUrl : null,
    hasHDAccess,
    freeAccessExpired,
    expiresAt: album.expiresAt,
    canUpgradeToHD: !hasHDAccess,
    hdPrice: 2.99,
    currency: 'EUR'
  };
};

exports.checkDirectoryStructure = function() {
  const staticDir = path.join(__dirname, '..', 'uploads');
  const dirs = [
    staticDir,
    path.join(staticDir, 'albums'),
    path.join(staticDir, 'albums', 'standard'),
    path.join(staticDir, 'albums', 'hd'),
    path.join(staticDir, 'mission-photos')
  ];

  console.log('📁 Checking directory structure:');
  dirs.forEach(dir => {
    const exists = fs.existsSync(dir);
    console.log(`${exists ? '✅' : '❌'} ${dir}`);
  });

  return dirs.every(dir => fs.existsSync(dir));
};

// ✅ Export the path resolution function for testing
exports.resolvePhotoPath = resolvePhotoPath;