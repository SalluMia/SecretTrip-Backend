// src/controllers/test.controller.js - Test endpoints for file uploads and PDF generation
const { successResponse, errorResponse } = require('../utils/response');
const { prisma } = require('../config/prisma');
const albumService = require('../services/album.service');
const scalewayStorage = require('../services/scalewayStorage.service');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');

// Test PDF generation and storage
exports.testPDFGeneration = async (req, res, next) => {
  try {
    const { tripId } = req.params;
    const { quality = 'standard' } = req.query;

    console.log(`🧪 Testing PDF generation for trip: ${tripId}, quality: ${quality}`);

    // Verify trip exists
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        assignedMissions: {
          where: { 
            completed: true, 
            photoUrl: { not: null }
          },
          include: {
            user: { select: { displayName: true } },
            missionTemplate: { select: { title: true, instruction: true } }
          },
          orderBy: { submittedAt: 'asc' }
        }
      }
    });

    if (!trip) {
      return errorResponse(res, 404, 'Trip not found');
    }

    if (trip.assignedMissions.length === 0) {
      return errorResponse(res, 400, 'No completed missions with photos found');
    }

    // Test PDF generation
    const startTime = Date.now();
    const result = await albumService.createPDF(trip, quality);
    const generationTime = Date.now() - startTime;

    // Verify file exists
    const fileExists = await scalewayStorage.fileExists(result.key);
    
    // Get file info if it exists
    let fileInfo = null;
    if (fileExists) {
      try {
        // For Scaleway, we can't easily get file stats, so we'll just confirm it exists
        fileInfo = {
          exists: true,
          url: result.urlPath,
          key: result.key,
          bucket: result.bucket
        };
      } catch (error) {
        console.error('Error getting file info:', error);
      }
    }

    successResponse(res, 200, 'PDF generation test completed', {
      trip: {
        id: trip.id,
        name: trip.name,
        totalMissions: trip.assignedMissions.length
      },
      pdf: {
        quality,
        generationTime: `${generationTime}ms`,
        filePath: result.filePath,
        urlPath: result.urlPath,
        key: result.key,
        fileExists,
        fileInfo
      },
      missions: trip.assignedMissions.map(m => ({
        id: m.id,
        title: m.missionTemplate?.title || 'Untitled Mission',
        photoUrl: m.photoUrl,
        submittedBy: m.user.displayName
      }))
    });

  } catch (err) {
    console.error('❌ PDF generation test failed:', err);
    next(err);
  }
};

// Test file upload overwrite functionality
exports.testFileOverwrite = async (req, res, next) => {
  try {
    const { fileType = 'profile' } = req.query;
    const userId = req.user.id;

    console.log(`🧪 Testing file overwrite for type: ${fileType}, user: ${userId}`);

    if (!req.file) {
      return errorResponse(res, 400, 'Test file is required');
    }

    let testResult = {};

    switch (fileType) {
      case 'profile':
        // Test profile photo overwrite
        const existingUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { profilePhotoUrl: true }
        });

        testResult = {
          type: 'profile',
          hadExistingPhoto: !!existingUser?.profilePhotoUrl,
          oldPhotoUrl: existingUser?.profilePhotoUrl,
          newPhotoUrl: req.file.scaleway?.url,
          overwriteExpected: !!existingUser?.profilePhotoUrl
        };
        break;

      case 'mission':
        // Test mission photo overwrite (would need missionId)
        const { missionId } = req.body;
        if (!missionId) {
          return errorResponse(res, 400, 'Mission ID required for mission photo test');
        }

        const existingMission = await prisma.assignedMission.findUnique({
          where: { id: missionId },
          select: { photoUrl: true, thumbnailUrl: true }
        });

        testResult = {
          type: 'mission',
          missionId,
          hadExistingPhoto: !!existingMission?.photoUrl,
          oldPhotoUrl: existingMission?.photoUrl,
          oldThumbnailUrl: existingMission?.thumbnailUrl,
          newPhotoUrl: req.file.scaleway?.url,
          overwriteExpected: !!existingMission?.photoUrl
        };
        break;

      default:
        return errorResponse(res, 400, 'Invalid file type. Use: profile, mission');
    }

    successResponse(res, 200, 'File overwrite test completed', {
      uploadResult: req.file.scaleway,
      testResult,
      middleware: {
        detectedFolder: req.file.scaleway?.key?.split('/')[0],
        fileName: req.file.scaleway?.fileName,
        fileSize: req.file.size
      }
    });

  } catch (err) {
    console.error('❌ File overwrite test failed:', err);
    next(err);
  }
};

// Test Scaleway storage operations
exports.testScalewayOperations = async (req, res, next) => {
  try {
    console.log('🧪 Testing Scaleway storage operations...');

    // Create a simple test file
    const testFileName = `test_${Date.now()}.txt`;
    const testContent = `Test file created at ${new Date().toISOString()}`;
    const testBuffer = Buffer.from(testContent, 'utf8');

    const tests = [];

    // Test 1: Upload file
    try {
      const uploadResult = await scalewayStorage.uploadFile(
        testBuffer,
        testFileName,
        'test-uploads',
        'text/plain'
      );
      tests.push({
        test: 'Upload File',
        success: true,
        result: uploadResult
      });

      // Test 2: Check if file exists
      const fileExists = await scalewayStorage.fileExists(uploadResult.key);
      tests.push({
        test: 'File Exists Check',
        success: fileExists,
        result: { exists: fileExists, key: uploadResult.key }
      });

      // Test 3: Generate signed URL
      try {
        const signedUrl = await scalewayStorage.getSignedUrl(uploadResult.key, 300); // 5 minutes
        tests.push({
          test: 'Generate Signed URL',
          success: true,
          result: { signedUrl: signedUrl.substring(0, 100) + '...' } // Truncate for security
        });
      } catch (signedUrlError) {
        tests.push({
          test: 'Generate Signed URL',
          success: false,
          error: signedUrlError.message
        });
      }

      // Test 4: Delete file
      const deleteResult = await scalewayStorage.deleteFile(uploadResult.key);
      tests.push({
        test: 'Delete File',
        success: deleteResult,
        result: { deleted: deleteResult, key: uploadResult.key }
      });

    } catch (uploadError) {
      tests.push({
        test: 'Upload File',
        success: false,
        error: uploadError.message
      });
    }

    // Test 5: Test uploadFileExact (for consistent filenames)
    try {
      const exactFileName = 'test_exact_filename.txt';
      const exactUploadResult = await scalewayStorage.uploadFileExact(
        testBuffer,
        exactFileName,
        'test-uploads',
        'text/plain'
      );
      tests.push({
        test: 'Upload File Exact',
        success: true,
        result: exactUploadResult
      });

      // Clean up
      await scalewayStorage.deleteFile(exactUploadResult.key);
    } catch (exactError) {
      tests.push({
        test: 'Upload File Exact',
        success: false,
        error: exactError.message
      });
    }

    const successCount = tests.filter(t => t.success).length;
    const totalTests = tests.length;

    successResponse(res, 200, 'Scaleway operations test completed', {
      summary: {
        total: totalTests,
        passed: successCount,
        failed: totalTests - successCount,
        success: successCount === totalTests
      },
      tests,
      scalewayConfig: {
        region: process.env.SCALEWAY_REGION,
        bucket: process.env.SCALEWAY_BUCKET_NAME,
        hasCredentials: !!(process.env.SCALEWAY_ACCESS_KEY_ID && process.env.SCALEWAY_SECRET_ACCESS_KEY)
      }
    });

  } catch (err) {
    console.error('❌ Scaleway operations test failed:', err);
    next(err);
  }
};

// Test album service functions
exports.testAlbumService = async (req, res, next) => {
  try {
    const { tripId } = req.params;

    console.log(`🧪 Testing album service for trip: ${tripId}`);

    // Test 1: Directory structure check
    const directoryCheck = albumService.checkDirectoryStructure();

    // Test 2: Photo diagnosis
    const diagnosis = await albumService.diagnoseMissionPhotos(tripId);

    // Test 3: Get trip data
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        assignedMissions: {
          where: { completed: true, photoUrl: { not: null } },
          include: {
            user: { select: { displayName: true } },
            missionTemplate: { select: { title: true } }
          }
        }
      }
    });

    if (!trip) {
      return errorResponse(res, 404, 'Trip not found');
    }

    // Test 4: Photo path resolution
    const photoTests = trip.assignedMissions.slice(0, 3).map(mission => {
      const resolvedPath = albumService.resolvePhotoPath(mission.photoUrl);
      return {
        missionId: mission.id,
        originalUrl: mission.photoUrl,
        resolvedPath,
        missionTitle: mission.missionTemplate?.title
      };
    });

    successResponse(res, 200, 'Album service test completed', {
      trip: {
        id: trip.id,
        name: trip.name,
        totalMissions: trip.assignedMissions.length
      },
      tests: {
        directoryStructure: {
          success: directoryCheck,
          result: directoryCheck
        },
        photoDiagnosis: {
          success: diagnosis.issues.length === 0,
          result: {
            totalMissions: diagnosis.totalMissions,
            workingPhotos: diagnosis.working.length,
            issues: diagnosis.issues.length,
            availableFiles: diagnosis.availableFiles
          }
        },
        photoPathResolution: {
          success: photoTests.length > 0,
          result: photoTests
        }
      }
    });

  } catch (err) {
    console.error('❌ Album service test failed:', err);
    next(err);
  }
};

// Create a simple test PDF
exports.createTestPDF = async (req, res, next) => {
  try {
    console.log('🧪 Creating test PDF...');

    // Create a simple PDF document
    const doc = new PDFDocument();
    const fileName = `test_pdf_${Date.now()}.pdf`;
    
    // Create PDF content
    doc.fontSize(20).text('Test PDF Document', 100, 100);
    doc.fontSize(12).text(`Created at: ${new Date().toISOString()}`, 100, 150);
    doc.text('This is a test PDF to verify PDF generation and upload functionality.', 100, 200);
    
    // Add some test content
    doc.addPage();
    doc.fontSize(16).text('Test Page 2', 100, 100);
    doc.text('Testing multi-page PDF generation...', 100, 150);

    // Convert to buffer
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    
    await new Promise((resolve, reject) => {
      doc.on('end', resolve);
      doc.on('error', reject);
      doc.end();
    });

    const pdfBuffer = Buffer.concat(chunks);

    // Upload to Scaleway
    const uploadResult = await scalewayStorage.uploadFile(
      pdfBuffer,
      fileName,
      'test-pdfs',
      'application/pdf'
    );

    // Verify upload
    const fileExists = await scalewayStorage.fileExists(uploadResult.key);

    successResponse(res, 200, 'Test PDF created and uploaded successfully', {
      pdf: {
        fileName,
        size: pdfBuffer.length,
        uploadResult,
        fileExists,
        downloadUrl: uploadResult.url
      }
    });

  } catch (err) {
    console.error('❌ Test PDF creation failed:', err);
    next(err);
  }
};

// Functions are already exported using exports.functionName above
// No need for additional module.exports
