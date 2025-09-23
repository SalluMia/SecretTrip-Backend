// src/routes/test.routes.js - Test routes for file uploads and PDF generation
const express = require('express');
const testController = require('../controllers/test.controller');
const authMiddleware = require('../middlewares/auth');
const { uploadProfilePhoto, uploadMissionPhoto, handleMulterError, uploadToScaleway } = require('../middlewares/scalewayUpload');

const router = express.Router();

// Apply authentication to all test routes
router.use(authMiddleware);

// Test PDF generation
router.get('/pdf-generation/:tripId', testController.testPDFGeneration);

// Test file overwrite functionality
router.post('/file-overwrite', 
  uploadProfilePhoto, 
  handleMulterError, 
  uploadToScaleway, 
  testController.testFileOverwrite
);

// Test mission photo overwrite
router.post('/mission-overwrite/:missionId', 
  uploadMissionPhoto, 
  handleMulterError, 
  uploadToScaleway, 
  testController.testFileOverwrite
);

// Test Scaleway storage operations
router.get('/scaleway-operations', testController.testScalewayOperations);

// Test album service functions
router.get('/album-service/:tripId', testController.testAlbumService);

// Create test PDF
router.post('/create-pdf', testController.createTestPDF);

module.exports = router;
