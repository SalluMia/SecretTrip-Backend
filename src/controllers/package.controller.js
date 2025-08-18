const packageService = require('../services/package.service');
const { successResponse, errorResponse } = require('../utils/response');

// Get all active packages for users
exports.getActivePackages = async (req, res, next) => {
  try {
    const packages = await packageService.getActivePackages();
    successResponse(res, 200, 'Active packages retrieved successfully', packages);
  } catch (err) {
    next(err);
  }
};

// Get package details by ID
exports.getPackageById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const package = await packageService.getPackageById(id);
    
    if (!package) {
      return errorResponse(res, 404, 'Package not found');
    }
    
    successResponse(res, 200, 'Package details retrieved successfully', package);
  } catch (err) {
    next(err);
  }
};

// Get available packages for a specific trip
exports.getTripPackages = async (req, res, next) => {
  try {
    const { tripId } = req.params;
    const packages = await packageService.getTripPackages(tripId);
    successResponse(res, 200, 'Trip packages retrieved successfully', packages);
  } catch (err) {
    next(err);
  }
};

// Validate package selection for a trip
exports.validatePackageForTrip = async (req, res, next) => {
  try {
    const { tripId, packageId } = req.params;
    const validation = await packageService.validatePackageForTrip(tripId, packageId);
    successResponse(res, 200, 'Package validation completed', validation);
  } catch (err) {
    next(err);
  }
};

// Get package pricing information (public endpoint)
exports.getPackagePricing = async (req, res, next) => {
  try {
    const pricing = await packageService.getPackagePricing();
    successResponse(res, 200, 'Package pricing retrieved successfully', pricing);
  } catch (err) {
    next(err);
  }
};
