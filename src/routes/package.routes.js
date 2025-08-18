const express = require('express');
const router = express.Router();
const packageController = require('../controllers/package.controller');
const { authenticate } = require('../middlewares/auth');

// Public routes (no authentication required)
router.get('/pricing', packageController.getPackagePricing);

// Protected routes (authentication required)
// router.use(authenticate);

// Get all active packages
router.get('/', packageController.getActivePackages);

// Get package by ID
router.get('/:id', packageController.getPackageById);

// Get packages for a specific trip
router.get('/trip/:tripId', packageController.getTripPackages);

// Validate package for a trip
router.get('/trip/:tripId/validate/:packageId', packageController.validatePackageForTrip);

module.exports = router;
