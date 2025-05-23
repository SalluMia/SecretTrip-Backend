// controllers/profile.controller.js
const profileService = require('../services/profile.service');
const { successResponse, errorResponse } = require('../utils/response');

// Complete user profile
exports.completeProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { travelInterests } = req.body;
    console.log('photo', req.file)
    // Parse travel interests if sent as string
    let parsedInterests;
    try {
      parsedInterests = typeof travelInterests === 'string' 
        ? JSON.parse(travelInterests) 
        : travelInterests;
    } catch (parseError) {
      return errorResponse(res, 400, 'Invalid travel interests format');
    }

    const profilePhotoPath = req.file ? req.file.path : null;
   
    const data = await profileService.completeProfile({
      userId,
      travelInterests: parsedInterests,
      profilePhotoPath
    });

    successResponse(res, 200, 'Profile completed successfully', data);
  } catch (err) {
    next(err);
  }
};

// Get user profile
exports.getUserProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const data = await profileService.getUserProfile({ userId });
    successResponse(res, 200, 'Profile retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

// Update user profile
exports.updateProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { displayName, travelInterests } = req.body;
    
    // Parse travel interests if sent as string
    let parsedInterests;
    if (travelInterests) {
      try {
        parsedInterests = typeof travelInterests === 'string' 
          ? JSON.parse(travelInterests) 
          : travelInterests;
      } catch (parseError) {
        return errorResponse(res, 400, 'Invalid travel interests format');
      }
    }

    const profilePhotoPath = req.file ? req.file.path : null;

    const data = await profileService.updateProfile({
      userId,
      displayName,
      travelInterests: parsedInterests,
      profilePhotoPath
    });

    successResponse(res, 200, 'Profile updated successfully', data);
  } catch (err) {
    next(err);
  }
};

// Get available travel interests
exports.getTravelInterests = async (req, res, next) => {
  try {
    const data = await profileService.getTravelInterests();
    successResponse(res, 200, 'Travel interests retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};