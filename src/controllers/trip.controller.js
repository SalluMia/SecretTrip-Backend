const tripService = require('../services/trip.service');
const { successResponse, errorResponse } = require('../utils/response');
const { prisma } = require('../config/prisma');
const notificationService = require('../services/notification.service');

// Create a new trip
exports.createTrip = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { name, theme, location, startDate, endDate, alias, description, tripMode = 'normal' } = req.body;

    if (!name || !theme || !location || !startDate || !endDate || !alias || !description) {
      return errorResponse(res, 400, 'All fields are required');
    }

    // Validate date format and logic
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return errorResponse(res, 400, 'Invalid date format');
    }
    
    if (start >= end) {
      return errorResponse(res, 400, 'Start date must be before end date');
    }

    // // Check if user has FCM token (for receiving join notifications)
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
    
    // ✅ Enhanced response with status information
    const responseMessage = data.isActive 
      ? 'Trip created and activated! Your adventure begins now 🚀'
      : 'Trip created successfully! Get ready for your upcoming adventure 📅';
    
    const responseData = {
      tripId: data.tripId,
      code: data.code,
      status: data.status,
      isActive: data.isActive,
      message: data.message,
      createdAt: new Date().toISOString(),
    };
    
    console.log(`✅ Trip "${name}" created with status: ${data.status}`);
    if (data.isActive) {
      console.log('🎯 Trip is active - missions have been assigned');
    }
    
    successResponse(res, 201, responseMessage, responseData);
  } catch (err) {
    // Handle specific creation errors
    if (err.message.includes('overlap') || err.message.includes('conflict')) {
      return errorResponse(res, 409, err.message);
    }
    
    if (err.message === 'Cannot create a trip with end date in the past') {
      return errorResponse(res, 400, 'Cannot create a trip with end date in the past. Please choose future dates.');
    }
    
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
     console.log(data,'my missions')
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
    // if (err.message.includes('Trip not found or you are not a member')) {
    //   return errorResponse(res, 404, 'Trip not found or you do not have access to this trip');
    // }
    
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


exports.deleteTrip = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { tripId } = req.params;

    if (!tripId) {
      return errorResponse(res, 400, 'Trip ID is required');
    }

    const data = await tripService.deleteTrip({ tripId, userId });
    
    successResponse(res, 200, `Trip "${data.tripName}" deleted successfully`, {
      deletedTripId: tripId,
      tripName: data.tripName,
      deletedAt: new Date().toISOString(),
      membersNotified: data.membersNotified || 0,
      deletionReason: data.deletionReason
    });
  } catch (err) {
    // Handle specific delete errors
    if (err.message === 'Trip not found') {
      return errorResponse(res, 404, 'Trip not found');
    }
    
    if (err.message === 'Only trip creator can delete the trip') {
      return errorResponse(res, 403, 'Access denied. Only the trip creator can delete this trip');
    }
    
    if (err.message === 'Trip has multiple members. Cannot delete trip with other members') {
      return errorResponse(res, 400, 'Cannot delete trip with other members. Please ask other members to leave first.');
    }
    
    if (err.message === 'Only active or upcoming trips can be deleted by single user') {
      return errorResponse(res, 400, 'Only active or upcoming trips can be deleted when you are the only member.');
    }
    
    if (err.message.includes('cannot be deleted')) {
      return errorResponse(res, 400, err.message);
    }
    
    next(err);
  }
};


exports.editTrip = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { tripId } = req.params;
    const updateData = req.body;

    // Validate tripId
    if (!tripId) {
      return errorResponse(res, 400, 'Trip ID is required');
    }

    // Validate that at least one field is provided for update
    const allowedFields = ['name', 'description', 'theme', 'location', 'startDate', 'endDate', 'tripMode'];
    const hasValidFields = Object.keys(updateData).some(key => 
      allowedFields.includes(key) && updateData[key] !== undefined && updateData[key] !== null
    );

    if (!hasValidFields) {
      return errorResponse(res, 400, 'No valid fields provided for update. Allowed fields: ' + allowedFields.join(', '));
    }

    // Validate specific fields if provided
    if (updateData.name && updateData.name.trim().length < 3) {
      return errorResponse(res, 400, 'Trip name must be at least 3 characters long');
    }

    if (updateData.startDate && updateData.endDate) {
      const startDate = new Date(updateData.startDate);
      const endDate = new Date(updateData.endDate);
      
      if (startDate >= endDate) {
        return errorResponse(res, 400, 'Start date must be before end date');
      }
    }

    // Call service to edit trip
    const data = await tripService.editTrip({ tripId, userId, updateData });
    
    console.log(`✅ Trip "${data.name}" successfully updated by user ${userId}`);
    console.log(`📝 Updated fields: ${data.updatedFields.join(', ')}`);
    
    // Generate dynamic success message
    const fieldsUpdated = data.updatedFields.length;
    const fieldsText = fieldsUpdated === 1 ? 'field' : 'fields';
    const message = `Trip "${data.name}" updated successfully (${fieldsUpdated} ${fieldsText} modified)`;
    
    successResponse(res, 200, message, data);
  } catch (err) {
    console.error('Edit Trip Error:', {
      error: err.message,
      userId: req.user?.id,
      tripId: req.params?.tripId,
      updateData: req.body,
      timestamp: new Date().toISOString()
    });

    // Handle specific edit errors with appropriate HTTP status codes
    if (err.message === 'Trip not found') {
      return errorResponse(res, 404, 'Trip not found');
    }
    
    if (err.message === 'Only trip creator can edit the trip') {
      return errorResponse(res, 403, 'Access denied. Only the trip creator can edit this trip');
    }
    
    if (err.message.includes('cannot be edited')) {
      return errorResponse(res, 400, err.message);
    }
    
    if (err.message.includes('overlap') || err.message.includes('conflict')) {
      return errorResponse(res, 409, err.message);
    }
    
    if (err.message.includes('No valid fields')) {
      return errorResponse(res, 400, err.message);
    }
    
    // Unhandled errors go to global error handler
    next(err);
  }
};


// ✅ NEW: Leave trip endpoint
exports.leaveTrip = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { tripId } = req.params;
    const { reason } = req.body;

    // Validate tripId
    if (!tripId) {
      return errorResponse(res, 400, 'Trip ID is required');
    }

    // Validate reason (optional but if provided, should not be empty)
    if (reason !== undefined && reason !== null && reason.toString().trim().length === 0) {
      return errorResponse(res, 400, 'Reason cannot be empty if provided');
    }

    // Validate reason length
    if (reason && reason.toString().length > 500) {
      return errorResponse(res, 400, 'Reason cannot exceed 500 characters');
    }

    // Call service to leave trip with reason
    const data = await tripService.leaveTrip({ tripId, userId, reason });
    
    console.log(`✅ User ${userId} successfully left trip "${data.tripName}" with reason: "${data.reason}"`);
    
    // Generate dynamic success message
    let message = `Successfully left trip "${data.tripName}"`;
    if (data.reason && data.reason !== 'No reason provided') {
      message += ` (Reason: ${data.reason.substring(0, 50)}${data.reason.length > 50 ? '...' : ''})`;
    }
    
    successResponse(res, 200, message, {
      tripId: data.tripId,
      tripName: data.tripName,
      userName: data.userName,
      userAlias: data.userAlias,
      reason: data.reason,
      leftAt: data.leftAt,
      remainingMemberCount: data.remainingMemberCount,
      cleanupSummary: data.cleanupSummary,
      leaveActivity: data.leaveActivity
    });
  } catch (err) {
    console.error('Leave Trip Error:', {
      error: err.message,
      userId: req.user?.id,
      tripId: req.params?.tripId,
      reason: req.body?.reason,
      timestamp: new Date().toISOString()
    });

    // Handle specific leave trip errors
    if (err.message === 'Trip not found') {
      return errorResponse(res, 404, 'Trip not found');
    }
    
    if (err.message === 'You are not a member of this trip') {
      return errorResponse(res, 403, 'You are not a member of this trip');
    }
    
    if (err.message === 'Trip creator cannot leave the trip. Please delete the trip instead') {
      return errorResponse(res, 400, 'Trip creators cannot leave their own trips. Please delete the trip instead');
    }
    
    if (err.message.includes('Cannot leave')) {
      return errorResponse(res, 400, err.message);
    }

    if (err.message.includes('Reason cannot exceed 500 characters')) {
      return errorResponse(res, 400, err.message);
    }
    
    // Unhandled errors go to global error handler
    next(err);
  }
};

// ✅ NEW: Get completed missions endpoint
exports.getTripCompletedMissions = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { tripId } = req.params;

    // Validate tripId
    if (!tripId) {
      return errorResponse(res, 400, 'Trip ID is required');
    }

    // Call service to get completed missions
    const data = await tripService.getTripCompletedMissions({ tripId, userId });
    
    console.log(`✅ Retrieved ${data.summary.totalCompleted} completed missions for user ${userId} in trip "${data.trip.name}"`);
    
    // Generate dynamic response message
    const { totalCompleted, completionPercentage, categoriesCompleted } = data.summary;
    let message = `Retrieved ${totalCompleted} completed missions`;
    
    if (totalCompleted > 0) {
      message += ` (${completionPercentage}% completion rate)`;
      if (categoriesCompleted > 1) {
        message += ` across ${categoriesCompleted} categories`;
      }
    } else {
      message = 'No completed missions found for this trip';
    }
    
    successResponse(res, 200, message, data);
  } catch (err) {
    console.error('Get Completed Missions Error:', {
      error: err.message,
      userId: req.user?.id,
      tripId: req.params?.tripId,
      timestamp: new Date().toISOString()
    });

    // Handle specific errors
    if (err.message === 'Trip not found or you do not have access to this trip') {
      return errorResponse(res, 404, 'Trip not found or you do not have access to this trip');
    }
    
    // Unhandled errors go to global error handler
    next(err);
  }
};

exports.getUserCompletedMissionsHistory = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Get all completed missions with trip info
    const missions = await tripService.getUserCompletedMissionsHistory({ userId });

    return res.status(200).json(missions);
  } catch (err) {
    console.error('Error fetching completed missions history:', err);
    next(err);
  }
};

