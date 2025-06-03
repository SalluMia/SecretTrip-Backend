const adminService = require('../services/admin.service');
const { successResponse, errorResponse } = require('../utils/response');

exports.getDashboardAnalytics = async (req, res, next) => {
  try {
    const data = await adminService.getAdminDashboardStats();
    successResponse(res, 200, 'Admin dashboard data fetched', data);
  } catch (err) {
    next(err);
  }
};

// ==================== USER CONTROLLER FUNCTIONS =========================

exports.getAllUsers = async (req, res, next) => {
  try {
    const filters = req.query; // search, status
    const users = await adminService.getAllUsers(filters);
    successResponse(res, 200, 'All users fetched', users);
  } catch (error) {
    next(error);
  }
};


exports.toggleUserStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action } = req.query;
     console.log(action, req.query)
    if (!['block', 'unblock'].includes(action)) {
      return errorResponse(res, 400, 'Action must be either block or unblock');
    }

    const data = await adminService.toggleUserStatus(id, action);
    successResponse(res, 200, `User ${action}ed successfully`, data);
  } catch (err) {
    next(err);
  }
};

exports.getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = await adminService.getUserById(id);

    if (!data) return errorResponse(res, 404, 'User not found');
    successResponse(res, 200, 'User detail fetched', data);
  } catch (err) {
    next(err);
  }
};


exports.getAllTrips = async (req, res, next) => {
  try {
    const data = await adminService.getAllTrips();
    successResponse(res, 200, 'All trips fetched', data);
  } catch (err) {
    next(err);
  }
};

exports.getFullTripDetail = async (req, res, next) => {
  try {
    const { tripId } = req.params;
    const data = await adminService.getFullTripDetail(tripId);
    successResponse(res, 200, 'Trip full detail fetched', data);
  } catch (err) {
    next(err);
  }
};

exports.createPackage = async (req, res, next) => {
  try {
    const { name, price, features } = req.body;
    if (!name || !price || !features || !Array.isArray(features)) {
      return errorResponse(res, 400, 'All fields are required and features must be an array');
    }

    const data = await adminService.createPackage({ name, price, features });
    successResponse(res, 201, 'Package created successfully', data);
  } catch (err) {
    next(err);
  }
};

exports.getAllPackages = async (req, res, next) => {
  try {
    const data = await adminService.getAllPackages();
    successResponse(res, 200, 'All packages fetched', data);
  } catch (err) {
    next(err);
  }
};

exports.updatePackage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, price, features } = req.body;
    const data = await adminService.updatePackage(id, { name, price, features });
    successResponse(res, 200, 'Package updated successfully', data);
  } catch (err) {
    next(err);
  }
};

exports.deletePackage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = await adminService.deletePackage(id);
    successResponse(res, 200, 'Package deleted successfully', data);
  } catch (err) {
    next(err);
  }
};

exports.togglePackageStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
     const { action } = req.query;

    if (!['active', 'inactive'].includes(action)) {
      return errorResponse(res, 400, 'Action must be either active or inactive');
    }
    const data = await adminService.togglePackageStatus(id,action.toUpperCase());
    successResponse(res, 200, 'Package status updated', data);
  } catch (err) {
    next(err);
  }
};

// ============== CONTROLLER FUNCTIONS  ==============

exports.createMissionTemplate = async (req, res, next) => {
  try {
    const { title, instruction, location, type, level } = req.body;
    
    // Validation
    if (!title || !instruction || !location || !type) {
      return errorResponse(res, 400, 'Title, instruction, category, and type are required');
    }
    
    if (!['AESTHETIC', 'SECRET_AGENT'].includes(type)) {
      return errorResponse(res, 400, 'Type must be either AESTHETIC or SECRET_AGENT');
    }
    
    if (level && !['NORMAL', 'CRITICAL'].includes(level)) {
      return errorResponse(res, 400, 'Level must be either NORMAL or CRITICAL');
    }
    
    const data = await adminService.createMissionTemplate({
      title,
      instruction,
      location,
      type,
      level: level || 'NORMAL'
    });
    
    successResponse(res, 201, 'Mission template created successfully', data);
  } catch (err) {
    next(err);
  }
};

exports.getAllMissionTemplates = async (req, res, next) => {
  try {
    const { type, level, search } = req.query;
    
    const data = await adminService.getAllMissionTemplates({
      type: type?.toUpperCase(),
      level: level?.toUpperCase(),
      search
    });
    
    // Group data for response
    const response = {
      all: data,
      aesthetic: data.filter(m => m.type === 'AESTHETIC'),
      secretAgent: data.filter(m => m.type === 'SECRET_AGENT'),
      normal: data.filter(m => m.level === 'NORMAL'),
      critical: data.filter(m => m.level === 'CRITICAL'),
      stats: {
        total: data.length,
        aesthetic: data.filter(m => m.type === 'AESTHETIC').length,
        secretAgent: data.filter(m => m.type === 'SECRET_AGENT').length,
        normal: data.filter(m => m.level === 'NORMAL').length,
        critical: data.filter(m => m.level === 'CRITICAL').length
      }
    };
    
    successResponse(res, 200, 'Mission templates fetched successfully', response);
  } catch (err) {
    next(err);
  }
};

exports.getMissionTemplateById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = await adminService.getMissionTemplateById(id);
    
    if (!data) {
      return errorResponse(res, 404, 'Mission template not found');
    }
    
    successResponse(res, 200, 'Mission template fetched successfully', data);
  } catch (err) {
    next(err);
  }
};

exports.updateMissionTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, instruction, location, type, level } = req.body;
    
    // Validation
    if (type && !['AESTHETIC', 'SECRET_AGENT'].includes(type)) {
      return errorResponse(res, 400, 'Type must be either AESTHETIC or SECRET_AGENT');
    }
    
    if (level && !['NORMAL', 'CRITICAL'].includes(level)) {
      return errorResponse(res, 400, 'Level must be either NORMAL or CRITICAL');
    }
    
    const data = await adminService.updateMissionTemplate(id, {
      title,
      instruction,
      location,
      type,
      level
    });
    
    successResponse(res, 200, 'Mission template updated successfully', data);
  } catch (err) {
    next(err);
  }
};

exports.deleteMissionTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    await adminService.deleteMissionTemplate(id);
    successResponse(res, 200, 'Mission template deleted successfully');
  } catch (err) {
    next(err);
  }
};


// ============== PRIVACY POLICY CONTROLLER FUNCTIONS ==============

// ============== PRIVACY POLICY CONTROLLER FUNCTIONS ==============

exports.createPrivacyPolicy = async (req, res, next) => {
  try {
    const { language, content, version } = req.body;
    
    // Validation
    if (!language || !content) {
      return errorResponse(res, 400, 'Language and content are required');
    }
    
    // Validate language format (should be 2-letter code)
    if (!/^[a-z]{2}$/.test(language)) {
      return errorResponse(res, 400, 'Language must be a 2-letter lowercase code (e.g., en, fr)');
    }
    
    const data = await adminService.createPrivacyPolicy({
      language,
      content,
      version
    });
    
    successResponse(res, 201, 'Privacy policy created successfully', data);
  } catch (err) {
    if (err.message.includes('already exists')) {
      return errorResponse(res, 409, err.message);
    }
    next(err);
  }
};

exports.getPrivacyPolicy = async (req, res, next) => {
  try {
    const data = await adminService.getPrivacyPolicy();
    
    if (!data) {
      return errorResponse(res, 404, 'Privacy policy not found');
    }
    
    successResponse(res, 200, 'Privacy policy fetched successfully', data);
  } catch (err) {
    next(err);
  }
};

exports.updatePrivacyPolicy = async (req, res, next) => {
  try {
    const { language, content, version, isActive } = req.body;
    
    // Validate language format if provided
    if (language && !/^[a-z]{2}$/.test(language)) {
      return errorResponse(res, 400, 'Language must be a 2-letter lowercase code (e.g., en, fr)');
    }
    
    const data = await adminService.updatePrivacyPolicy({
      language,
      content,
      version,
      isActive
    });
    
    successResponse(res, 200, 'Privacy policy updated successfully', data);
  } catch (err) {
    if (err.message.includes('not found')) {
      return errorResponse(res, 404, err.message);
    }
    next(err);
  }
};

exports.deletePrivacyPolicy = async (req, res, next) => {
  try {
    await adminService.deletePrivacyPolicy();
    successResponse(res, 200, 'Privacy policy deleted successfully');
  } catch (err) {
    if (err.message.includes('not found')) {
      return errorResponse(res, 404, err.message);
    }
    next(err);
  }
};

