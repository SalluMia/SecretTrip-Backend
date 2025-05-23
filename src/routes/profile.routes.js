const express = require('express');
const { 
  completeProfile, 
  getUserProfile, 
  updateProfile, 
  getTravelInterests 
} = require('../controllers/profile.controller');
const authMiddleware = require('../middlewares/auth');
const { uploadProfilePhoto, handleMulterError } = require('../middlewares/upload');

const router = express.Router();

// Get available travel interests (public route)
router.get('/travel-interests', getTravelInterests);

// Protected routes - require authentication
router.use(authMiddleware);

// Complete user profile
router.post('/complete-profile', uploadProfilePhoto, handleMulterError, completeProfile);

// Get user profile
router.get('/me', getUserProfile);

// Update user profile
router.put('/update', uploadProfilePhoto, handleMulterError, updateProfile);

module.exports = router;