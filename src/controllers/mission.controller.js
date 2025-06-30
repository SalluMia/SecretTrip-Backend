// src/controllers/mission.controller.js
const missionPhotoService = require('../services/missionPhoto.service');
const { successResponse, errorResponse } = require('../utils/response');
const  missionService =require('../services/missionPhoto.service')
// Get user missions for a trip
exports.getUserMissions = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { tripId } = req.params;
    const { status } = req.query; // 'completed', 'pending', or null for all

    const missions = await missionPhotoService.getUserMissions({ 
      userId, 
      tripId, 
      status 
    });

    successResponse(res, 200, 'Missions retrieved successfully', {
      missions,
      total: missions.length,
      completed: missions.filter(m => m.completed).length,
      pending: missions.filter(m => !m.completed).length
    });
  } catch (err) {
    next(err);
  }
};

// Submit mission photo
exports.submitMissionPhoto = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { missionId } = req.params;
    const { caption } = req.body;

    if (!req.file) {
      return errorResponse(res, 400, 'Mission photo is required');
    }

    const result = await missionPhotoService.submitMissionPhoto({
      missionId,
      userId,
      photoPath: req.file.path,
      caption
    });

    successResponse(res, 200, result.message, {
      mission: result.mission,
      photoUrl: result.photoUrl,
      thumbnailUrl: result.thumbnailUrl
    });
  } catch (err) {
    next(err);
  }
};

// Retake mission photo
exports.retakeMissionPhoto = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { missionId } = req.params;

    const result = await missionPhotoService.retakeMissionPhoto({ 
      missionId, 
      userId 
    });

    successResponse(res, 200, result.message, result.mission);
  } catch (err) {
    next(err);
  }
};

// Get mission statistics for a trip
exports.getMissionStatistics = async (req, res, next) => {
  try {
    const { tripId } = req.params;
    const userId = req.user.id;

    // Verify user has access to the trip
    const trip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        OR: [
          { creatorId: userId },
          { members: { some: { id: userId } } }
        ]
      }
    });

    if (!trip) {
      return errorResponse(res, 403, 'Access denied to this trip');
    }

    const stats = await missionPhotoService.getMissionStatistics(tripId);
    successResponse(res, 200, 'Mission statistics retrieved', stats);
  } catch (err) {
    next(err);
  }
};

// Swap mission (existing functionality)
exports.swapMission = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { missionId } = req.params;

    const tripService = require('../services/trip.service');
    const data = await tripService.swapMission({ missionId, userId });
    
    successResponse(res, 200, 'Mission swapped successfully', data);
  } catch (err) {
    next(err);
  }
};

exports.getMissionDetail = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { missionId } = req.params;

    console.log(`🎯 Getting mission detail for User ID: ${userId}, Mission ID: ${missionId}`);

    if (!missionId) {
      return errorResponse(res, 400, 'Mission ID is required');
    }

    const missionDetail = await missionService.getMissionDetail({ 
      userId, 
      missionId 
    });

    console.log(`✅ Mission detail retrieved: "${missionDetail.title}" - completed: ${missionDetail.completed}`);

    const message = missionDetail.completed 
      ? `Mission "${missionDetail.title}" completed`
      : `Mission "${missionDetail.title}" pending`;

    successResponse(res, 200, message, missionDetail);
  } catch (err) {
    console.error(`❌ Error getting mission detail for user ${req.user.id}, mission ${req.params.missionId}:`, err.message);
    
    if (err.message === 'Mission not found') {
      return errorResponse(res, 404, 'Mission not found');
    }
    
    if (err.message === 'Unauthorized access to this mission') {
      return errorResponse(res, 403, 'You do not have access to this mission');
    }
    
    next(err);
  }
};