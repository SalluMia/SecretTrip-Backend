const tripService = require('../services/trip.service');
const { successResponse, errorResponse } = require('../utils/response');
const { prisma } = require('../config/prisma');
const notificationService = require('../services/notification.service');


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
    if (!['ACTIVE', 'UPCOMING', 'COMPLETED', 'active','upcoming','completed'].includes(status)) {
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

// Get trip details by code (for preview before joining)
exports.getTripByCode = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { code } = req.params;

    if (!code) {
      return errorResponse(res, 400, 'Trip code is required');
    }

    const data = await tripService.getTripByCode({ code, userId });
    successResponse(res, 200, 'Trip details retrieved', data);
  } catch (err) {
    next(err);
  }
};

// Enhanced join trip with better validation
exports.joinTripEnhanced = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { code, alias } = req.body;

    if (!code || !alias) {
      return errorResponse(res, 400, 'Code and alias are required');
    }

    // Validate alias format
    if (alias.length < 3 || alias.length > 20) {
      return errorResponse(res, 400, 'Alias must be between 3 and 20 characters');
    }

    if (!/^[a-zA-ZÀ-ÿ0-9\s_-]+$/.test(alias)) {
      return errorResponse(res, 400, 'Alias contains invalid characters');
    }

    const data = await tripService.requestJoinTripEnhanced({ userId, alias, code });
    
    // Send notification to trip creator
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true }
      });

      const trip = await prisma.trip.findUnique({
        where: { code },
        select: { 
          name: true, 
          creatorId: true 
        }
      });

      if (user && trip) {
        await notificationService.sendJoinRequestNotification({
          creatorId: trip.creatorId,
          requesterName: user.displayName,
          tripName: trip.name,
          alias
        });
      }
    } catch (notificationError) {
      console.error('Failed to send join request notification:', notificationError);
      // Don't fail the request if notification fails
    }

    successResponse(res, 200, 'Join request sent successfully', data);
  } catch (err) {
    next(err);
  }
};

// Enhanced respond to request with notifications
exports.respondToRequestEnhanced = async (req, res, next) => {
  try {
    const creatorId = req.user.id;
    const { tripId, userId } = req.params;
    const { action } = req.query;

    if (!['approve', 'reject'].includes(action)) {
      return errorResponse(res, 400, 'Invalid action. Must be approve or reject');
    }

    const data = await tripService.respondToRequestEnhanced({ 
      tripId, 
      userId, 
      action, 
      creatorId 
    });

    // Send notification to user
    try {
      const creator = await prisma.user.findUnique({
        where: { id: creatorId },
        select: { displayName: true }
      });

      if (creator) {
        await notificationService.sendRequestResponseNotification({
          userId,
          tripName: data.tripName,
          alias: data.alias,
          approved: action === 'approve',
          creatorName: creator.displayName
        });
      }
    } catch (notificationError) {
      console.error('Failed to send response notification:', notificationError);
      // Don't fail the request if notification fails
    }

    successResponse(res, 200, data.message, data);
  } catch (err) {
    next(err);
  }
};

// Get trip members with aliases
exports.getTripMembers = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { tripId } = req.params;

    const data = await tripService.getTripMembers({ tripId, userId });
    successResponse(res, 200, 'Trip members retrieved', data);
  } catch (err) {
    next(err);
  }
};

// Enhanced activate trip with notifications
exports.activateTripEnhanced = async (req, res, next) => {
  try {
    const creatorId = req.user.id;
    const { tripId } = req.params;

    const data = await tripService.activateTrip({ tripId, creatorId });

    // Send notifications to all trip members
    try {
      await notificationService.sendTripActivationNotification({
        tripId,
        tripName: data.name
      });
    } catch (notificationError) {
      console.error('Failed to send trip activation notifications:', notificationError);
      // Don't fail the request if notification fails
    }

    successResponse(res, 200, 'Trip activated and missions assigned', data);
  } catch (err) {
    next(err);
  }
};

// Get pending requests with enhanced details
exports.getPendingRequestsEnhanced = async (req, res, next) => {
  try {
    const creatorId = req.user.id;
    const { tripId } = req.params;

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      select: { creatorId: true, name: true }
    });

    if (!trip || trip.creatorId !== creatorId) {
      return errorResponse(res, 403, 'Unauthorized or trip not found');
    }

    const requests = await prisma.joinRequest.findMany({
      where: {
        tripId,
        status: 'pending'
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            profilePhotoUrl: true,
            createdAt: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const enhancedRequests = requests.map(request => ({
      id: request.id,
      alias: request.alias,
      requestedAt: request.createdAt,
      user: request.user
    }));

    successResponse(res, 200, 'Pending requests retrieved', {
      tripName: trip.name,
      requests: enhancedRequests,
      totalPending: enhancedRequests.length
    });
  } catch (err) {
    next(err);
  }
};

// Check alias availability
exports.checkAliasAvailability = async (req, res, next) => {
  try {
    const { code, alias } = req.query;

    if (!code || !alias) {
      return errorResponse(res, 400, 'Code and alias are required');
    }

    const trip = await prisma.trip.findUnique({
      where: { code },
      include: {
        tripAliases: {
          select: { alias: true }
        },
        joinRequests: {
          where: { status: 'pending' },
          select: { alias: true }
        }
      }
    });

    if (!trip) {
      return errorResponse(res, 404, 'Trip not found');
    }

    const takenAliases = [
      ...trip.tripAliases.map(ta => ta.alias.toLowerCase()),
      ...trip.joinRequests.map(jr => jr.alias.toLowerCase())
    ];

    const isAvailable = !takenAliases.includes(alias.toLowerCase());

    successResponse(res, 200, 'Alias availability checked', {
      alias,
      available: isAvailable,
      suggestions: isAvailable ? [] : generateAliasSuggestions(alias, takenAliases)
    });
  } catch (err) {
    next(err);
  }
};

// Update FCM token
exports.updateFCMToken = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { fcmToken } = req.body;

    if (!fcmToken) {
      return errorResponse(res, 400, 'FCM token is required');
    }

    await notificationService.updateFCMToken({ userId, fcmToken });
    successResponse(res, 200, 'FCM token updated successfully');
  } catch (err) {
    next(err);
  }
};

// Helper function to generate alias suggestions
function generateAliasSuggestions(baseAlias, takenAliases) {
  const suggestions = [];
  const base = baseAlias.toLowerCase();
  
  // Try adding numbers
  for (let i = 1; i <= 10; i++) {
    const suggestion = `${base}${i}`;
    if (!takenAliases.includes(suggestion)) {
      suggestions.push(suggestion);
      if (suggestions.length >= 3) break;
    }
  }
  
  // Try adding prefixes/suffixes
  const prefixes = ['agent', 'spy', 'secret'];
  const suffixes = ['x', 'pro', 'master'];
  
  for (const prefix of prefixes) {
    const suggestion = `${prefix}${base}`;
    if (!takenAliases.includes(suggestion) && !suggestions.includes(suggestion)) {
      suggestions.push(suggestion);
      if (suggestions.length >= 5) break;
    }
  }
  
  for (const suffix of suffixes) {
    const suggestion = `${base}${suffix}`;
    if (!takenAliases.includes(suggestion) && !suggestions.includes(suggestion)) {
      suggestions.push(suggestion);
      if (suggestions.length >= 5) break;
    }
  }
  
  return suggestions.slice(0, 3);
}
