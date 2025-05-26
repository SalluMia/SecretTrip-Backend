const tripService = require('../services/trip.service');
const { successResponse, errorResponse } = require('../utils/response');

exports.createTrip = async (req, res, next) => {
  try {
    const userId = req.user.id; // ✅ from auth middleware
    const { name, theme, startDate, endDate } = req.body;

    if (!name || !theme || !startDate || !endDate) {
      return errorResponse(res, 400, 'All fields are required');
    }

    const data = await tripService.createTrip({ userId, name, theme, startDate, endDate });
    successResponse(res, 201, 'Trip created successfully', data);
  } catch (err) {
    next(err);
  }
};

exports.joinTrip = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { code, alias } = req.body;

    if (!code || !alias) {
      return errorResponse(res, 400, 'Code and alias are required');
    }

    const data = await tripService.requestJoinTrip({ userId, code, alias });
    successResponse(res, 200, 'Join request submitted', data);
  } catch (err) {
    next(err);
  }
};

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

exports.respondToRequest = async (req, res, next) => {
  try {
    const creatorId = req.user.id;
    const { tripId, userId } = req.params;
    const { action } = req.query;

    if (!['approve', 'reject'].includes(action)) {
      return errorResponse(res, 400, 'Invalid action');
    }

    const data = await tripService.respondToRequest({ tripId, userId, action, creatorId });
    successResponse(res, 200, `Request ${action}ed successfully`, data);
  } catch (err) {
    next(err);
  }
};

exports.getMyTrips = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const data = await tripService.getMyTrips(userId);
    successResponse(res, 200, 'Your trips retrieved', data);
  } catch (err) {
    next(err);
  }
};
