const tripService = require('../services/trip.service');
const { successResponse, errorResponse } = require('../utils/response');
const { prisma } = require('../config/prisma');
// Create a new trip
exports.createTrip = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { name, theme, startDate, endDate, alias } = req.body;

    if (!name || !theme || !startDate || !endDate || !alias) {
      return errorResponse(res, 400, 'All fields are required');
    }

    const data = await tripService.createTrip({ userId, name, theme, startDate, endDate, alias });
    successResponse(res, 201, 'Trip created successfully', data);
  } catch (err) {
    next(err);
  }
};

// Request to join a trip
exports.joinTrip = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { code, alias } = req.body;

    if (!code || !alias) {
      return errorResponse(res, 400, 'Code and alias are required');
    }

    const data = await tripService.requestJoinTrip({ userId, alias, code });
    successResponse(res, 200, 'Join request sent', data);
  } catch (err) {
    next(err);
  }
};

// Approve or reject a join request
exports.respondToRequest = async (req, res, next) => {
  try {
    const creatorId = req.user.id;
    const { tripId, userId } = req.params;
    const { action } = req.query;

    if (!['approve', 'reject'].includes(action)) {
      return errorResponse(res, 400, 'Invalid action');
    }

    const data = await tripService.respondToRequest({ tripId, userId, action, creatorId });
    successResponse(res, 200, `Request ${action}ed`, data);
  } catch (err) {
    next(err);
  }
};

// Activate trip and assign missions
exports.activateTrip = async (req, res, next) => {
  try {
    const creatorId = req.user.id;
    const { tripId } = req.params;

    const data = await tripService.activateTrip({ tripId, creatorId });
    successResponse(res, 200, 'Trip activated and missions assigned', data);
  } catch (err) {
    next(err);
  }
};

// Get missions for a user in a trip
exports.getMyMissions = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { tripId } = req.params;

    const data = await tripService.getMyMissions({ userId, tripId });
    successResponse(res, 200, 'Missions retrieved', data);
  } catch (err) {
    next(err);
  }
};

// Swap a mission
exports.swapMission = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { missionId } = req.params;

    const data = await tripService.swapMission({ missionId, userId });
    successResponse(res, 200, 'Mission swapped', data);
  } catch (err) {
    next(err);
  }
};

// Submit photo for a mission
exports.submitMissionPhoto = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { missionId } = req.params;
    const { photoUrl } = req.body;

    if (!photoUrl) {
      return errorResponse(res, 400, 'Photo is required');
    }

    const data = await tripService.submitMissionPhoto({ missionId, userId, photoUrl });
    successResponse(res, 200, 'Mission completed', data);
  } catch (err) {
    next(err);
  }
};


// Get pending join requests for a trip (admin only)
exports.getPendingRequests = async (req, res, next) => {
  try {
    const creatorId = req.user.id;
    const { tripId } = req.params;

    const data = await tripService.getPendingRequests({ tripId, creatorId });
    successResponse(res, 200, 'Pending requests retrieved', data);
  } catch (err) {
    next(err);
  }
};

// Get all trips the user has created or joined
exports.getMyTrips = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const data = await tripService.getMyTrips(userId);
    successResponse(res, 200, 'Trips fetched successfully', data);
  } catch (err) {
    next(err);
  }
};


exports.getTripsByStatus = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;

    if (!['ACTIVE', 'UPCOMING', 'COMPLETED'].includes(status)) {
      return errorResponse(res, 400, 'Invalid status. Must be one of: active, upcoming, completed');
    }

    const data = await tripService.getTripsByStatus({ userId, status });
    successResponse(res, 200, 'Trips fetched', data);
  } catch (err) {
    next(err);
  }
};


exports.getTripDetails = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { tripId } = req.params;

    const data = await tripService.getTripDetails({ userId, tripId });
    successResponse(res, 200, 'Trip details fetched', data);
  } catch (err) {
    next(err);
  }
};


exports.getTripAlbumPreview = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { tripId } = req.params;

    const data = await tripService.getTripAlbumPreview({ userId, tripId });
    successResponse(res, 200, 'Album preview fetched', data);
  } catch (err) {
    next(err);
  }
};