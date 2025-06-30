const tripService = require('../services/trip.service');
const { successResponse, errorResponse } = require('../utils/response');
const { prisma } = require('../config/prisma');
const notificationService = require('../services/notification.service');

// Create a new trip
exports.createTrip = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { name, theme,location, startDate, endDate, alias, description, tripMode = 'normal' } = req.body;

    if (!name || !theme || !location || !startDate || !endDate || !alias || !description) {
      return errorResponse(res, 400, 'All fields are required');
    }

    // Check if user has FCM token (for receiving join notifications)
    // const user = await prisma.user.findUnique({
    //   where: { id: userId },
    //   select: { fcmToken: true }
    // });

    // if (!user.fcmToken) {
    //   return errorResponse(res, 400, 
    //     'Please enable notifications to receive join notifications from your friends'
    //   );
    // }

    const data = await tripService.createTrip({ 
      userId, 
      name, 
      theme, 
      location,
      startDate, 
      endDate, 
      alias, 
      description, 
      tripMode 
    });
    
    successResponse(res, 201, 'Trip created successfully', data);
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

    const data = await tripService.getTripByCodeWithDetails({ code, userId });
    successResponse(res, 200, 'Trip details retrieved', data);
  } catch (err) {
    next(err);
  }
};

// Direct join trip with automatic notification
exports.joinTrip = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { code, alias } = req.body;

    if (!code || !alias) {
      return errorResponse(res, 400, 'Trip code and alias are required.');
    }

    // Validate alias format
    if (alias.length < 3 || alias.length > 20) {
      return errorResponse(res, 400, 'Alias must be between 3 and 20 characters.');
    }

    if (!/^[a-zA-ZÀ-ÿ0-9\s_-]+$/.test(alias)) {
      return errorResponse(res, 400, 'Alias contains invalid characters. Only letters, numbers, spaces, hyphens, and underscores are allowed.');
    }

    const data = await tripService.joinTripDirectly({ userId, alias, code });

    // Send notification to trip creator
    try {
      const [user, trip] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { displayName: true }
        }),
        prisma.trip.findUnique({
          where: { code },
          select: {
            name: true,
            creatorId: true,
            creator: {
              select: {
                displayName: true
              }
            }
          }
        })
      ]);

      if (user && trip) {
        await notificationService.sendMemberJoinedNotification({
          creatorId: trip.creatorId,
          newMemberName: user.displayName,
          tripName: trip.name,
          alias,
          creatorName: trip.creator.displayName
        });
      }
    } catch (notificationError) {
      console.error('Failed to send join notification:', notificationError);
      // Do not block the response if notification fails
    }

    successResponse(res, 200, 'Successfully joined the trip!', data);
  } catch (err) {
    // Handle expected validation errors
    if (err.message.includes('active trip') || err.message.includes('conflict') || err.message.includes('sequential')) {
      return errorResponse(res, 409, err.message);
    }

    if (err.message === 'Trip not found') {
      return errorResponse(res, 404, 'Trip not found. Please check the trip code and try again.');
    }

    if (err.message === 'You cannot join a trip that has already started or ended') {
      return errorResponse(res, 400, 'This trip has already started or ended. You can only join upcoming trips.');
    }

    if (err.message === 'You are already a member of this trip') {
      return errorResponse(res, 409, 'You are already a member of this trip.');
    }

    if (err.message === 'This alias is already taken for this trip') {
      return errorResponse(res, 409, 'This alias is already taken. Please choose another one.');
    }

    // Unhandled errors go to the global error handler
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
        }
      }
    });

    if (!trip) {
      return errorResponse(res, 404, 'Trip not found');
    }

    const takenAliases = trip.tripAliases.map(ta => ta.alias.toLowerCase());
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

// Activate trip and assign missions
exports.activateTrip = async (req, res, next) => {
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

// Get missions for a user in a trip
exports.getMyMissions = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { tripId } = req.params;
    
    // Enhanced logging
    console.log(`🎯 Getting missions for User ID: ${userId}, Trip ID: ${tripId}`);
    
    // Validate tripId format (assuming UUID or specific format)
    if (!tripId) {
      return errorResponse(res, 400, 'Trip ID is required');
    }

    const data = await tripService.getMyMissions({ userId, tripId });
    
    // Enhanced success logging
    console.log(`✅ Retrieved ${data.missionSummary.total} missions for user ${userId} in trip "${data.trip.name}"`);
    console.log(`📊 Mission Stats: ${data.missionSummary.completed} completed, ${data.missionSummary.pending} pending (${data.missionSummary.completionPercentage}% complete)`);
    
    if (data.nextMission) {
      console.log(`🎯 Next mission: "${data.nextMission.title}"`);
    } else {
      console.log(`🎉 All missions completed for this trip!`);
    }

    // Create dynamic response message
    let message = `Retrieved ${data.missionSummary.total} missions`;
    if (data.nextMission) {
      message += `, next: "${data.nextMission.title}"`;
    }
    if (data.missionSummary.completionPercentage === 100) {
      message += ` - All missions completed! 🎉`;
    }

    successResponse(res, 200, message, data);
  } catch (err) {
    console.error(`❌ Error getting missions for user ${req.user.id}, trip ${req.params.tripId}:`, err.message);
    
    // Handle specific errors
    if (err.message.includes('Trip not found or you are not a member')) {
      return errorResponse(res, 404, 'Trip not found or you do not have access to this trip');
    }
    
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

// Get trips by status
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

// Get trip details
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

// Get trip album preview
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