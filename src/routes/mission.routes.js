const express = require('express');
const router = express.Router();
const missionController = require('../controllers/mission.controller');
const missionPhotoService = require('../services/missionPhoto.service');
const { uploadMissionPhoto, handleMulterError, uploadToScaleway } = require('../middlewares/scalewayUpload');
const auth = require('../middlewares/auth');

router.use(auth); // Protect all mission routes

// Get user missions for a trip
router.get('/trip/:tripId', missionController.getUserMissions);
router.get('/:missionId', missionController.getMissionDetail);
// Submit mission photo
router.post('/:missionId/submit', 
  uploadMissionPhoto,
  handleMulterError,
  uploadToScaleway,
  missionController.submitMissionPhoto
);

// Retake mission photo
router.post('/:missionId/retake', missionController.retakeMissionPhoto);

// Swap mission (existing functionality)
router.put('/:missionId/swap', missionController.swapMission);

// Get mission statistics for a trip
router.get('/trip/:tripId/statistics', missionController.getMissionStatistics);

module.exports = router;