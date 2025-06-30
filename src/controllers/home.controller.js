// controllers/home.controller.js

const { getHomeData } = require('../services/home.service');
const { successResponse } = require('../utils/response');

exports.getHome = async (req, res, next) => {
  try {
    const data = await getHomeData(req.user.id);
    
    // Create a more descriptive response message
    let message = 'Home data retrieved successfully';
    
    if (data.activeTrip) {
      message = `Active trip "${data.activeTrip.name}" with ${data.activeMissions.length} missions`;
    } else if (data.upcomingTrips.length > 0) {
      message = `${data.upcomingTrips.length} upcoming trips found`;
    } else {
      message = 'No active or upcoming trips';
    }
    
    successResponse(res, 200, message, data);
  } catch (err) {
    next(err);
  }
};