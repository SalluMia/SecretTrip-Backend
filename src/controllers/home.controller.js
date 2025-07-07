// // controllers/home.controller.js - SIMPLIFIED VERSION

// const { getHomeData } = require('../services/home.service');
// const { successResponse, errorResponse } = require('../utils/response');

// // ✅ HELPER: Generate simple response message
// const generateMessage = (data) => {
//   let message = 'Home data retrieved successfully';
  
//   if (data.activeTrip) {
//     const role = data.activeTrip.isCreator ? 'creator' : 'member';
//     const missionsCount = data.activeMissions.length;
//     const missionsText = missionsCount === 1 ? 'mission' : 'missions';
//     message = `Active trip "${data.activeTrip.title}" (as ${role}) with ${missionsCount} ${missionsText}`;
//   }
  
//   if (data.upcomingTrips.length > 0) {
//     const { createdUpcomingTrips, joinedUpcomingTrips } = data.summary;
    
//     if (data.activeTrip) {
//       // Has active trip + upcoming trips
//       if (createdUpcomingTrips > 0 && joinedUpcomingTrips > 0) {
//         message += `, ${createdUpcomingTrips} created and ${joinedUpcomingTrips} joined upcoming trips`;
//       } else if (createdUpcomingTrips > 0) {
//         message += `, ${createdUpcomingTrips} created upcoming trips`;
//       } else {
//         message += `, ${joinedUpcomingTrips} joined upcoming trips`;
//       }
//     } else {
//       // Only upcoming trips
//       if (createdUpcomingTrips > 0 && joinedUpcomingTrips > 0) {
//         message = `${createdUpcomingTrips} created and ${joinedUpcomingTrips} joined upcoming trips`;
//       } else if (createdUpcomingTrips > 0) {
//         const text = createdUpcomingTrips === 1 ? 'trip' : 'trips';
//         message = `${createdUpcomingTrips} created upcoming ${text}`;
//       } else {
//         const text = joinedUpcomingTrips === 1 ? 'trip' : 'trips';
//         message = `${joinedUpcomingTrips} joined upcoming ${text}`;
//       }
//     }
//   } else if (!data.activeTrip) {
//     message = 'No active or upcoming trips found';
//   }
  
//   return message;
// };

// exports.getHome = async (req, res, next) => {
//   try {
//     // ✅ Basic validation
//     if (!req.user?.id) {
//       return errorResponse(res, 401, 'User authentication required');
//     }

//     // ✅ Get data
//     const data = await getHomeData(req.user.id);
    
//     // ✅ Generate message
//     const message = generateMessage(data);
    
//     // ✅ Send response with minimal metadata
//     const responseData = {
//       ...data,
//       metadata: {
//         requestedAt: new Date().toISOString(),
//         userId: req.user.id
//       }
//     };
    
//     successResponse(res, 200, message, responseData);
    
//   } catch (err) {
//     // ✅ Simple error handling
//     console.error('Home Controller Error:', {
//       error: err.message,
//       userId: req.user?.id,
//       timestamp: new Date().toISOString()
//     });
    
//     err.context = 'home.controller.getHome';
//     next(err);
//   }
// };

// controllers/home.controller.js - UPDATED VERSION

const { getHomeData } = require('../services/home.service');
const { successResponse, errorResponse } = require('../utils/response');

// ✅ HELPER: Generate simple response message
const generateMessage = (data) => {
  let message = 'Home data retrieved successfully';
  
  if (data.activeTrip) {
    const role = data.activeTrip.isCreator ? 'creator' : 'member';
    const missionsCount = data.activeMissions.length;
    const missionsText = missionsCount === 1 ? 'mission' : 'missions';
    message = `Active trip "${data.activeTrip.title}" (as ${role}) with ${missionsCount} ${missionsText}`;
  }
  
  if (data.upcomingTrips.length > 0) {
    const { createdUpcomingTrips, joinedUpcomingTrips } = data.summary;
    
    if (data.activeTrip) {
      // Has active trip + upcoming trips
      if (createdUpcomingTrips > 0 && joinedUpcomingTrips > 0) {
        message += `, ${createdUpcomingTrips} created and ${joinedUpcomingTrips} joined upcoming trips`;
      } else if (createdUpcomingTrips > 0) {
        message += `, ${createdUpcomingTrips} created upcoming trips`;
      } else {
        message += `, ${joinedUpcomingTrips} joined upcoming trips`;
      }
    } else {
      // Only upcoming trips
      if (createdUpcomingTrips > 0 && joinedUpcomingTrips > 0) {
        message = `${createdUpcomingTrips} created and ${joinedUpcomingTrips} joined upcoming trips`;
      } else if (createdUpcomingTrips > 0) {
        const text = createdUpcomingTrips === 1 ? 'trip' : 'trips';
        message = `${createdUpcomingTrips} created upcoming ${text}`;
      } else {
        const text = joinedUpcomingTrips === 1 ? 'trip' : 'trips';
        message = `${joinedUpcomingTrips} joined upcoming ${text}`;
      }
    }
  } else if (!data.activeTrip) {
    message = 'No active or upcoming trips found';
  }
  
  return message;
};

exports.getHome = async (req, res, next) => {
  try {
    // ✅ Basic validation
    if (!req.user?.id) {
      return errorResponse(res, 401, 'User authentication required');
    }

    // ✅ Get data
    const data = await getHomeData(req.user.id);
    
    // ✅ Generate message
    const message = generateMessage(data);
    
    // ✅ Send response with minimal metadata
    const responseData = {
      ...data,
      metadata: {
        requestedAt: new Date().toISOString(),
        userId: req.user.id
      }
    };
    
    successResponse(res, 200, message, responseData);
    
  } catch (err) {
    // ✅ Simple error handling
    console.error('Home Controller Error:', {
      error: err.message,
      userId: req.user?.id,
      timestamp: new Date().toISOString()
    });
    
    err.context = 'home.controller.getHome';
    next(err);
  }
};