const { default: axios } = require('axios');
const adminService = require('../services/admin.service');
const { successResponse, errorResponse } = require('../utils/response');
const fs = require('fs');
const path = require('path');

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

// exports.getFullTripDetail = async (req, res, next) => {
//   try {
//     const { tripId } = req.params;
//     const data = await adminService.getFullTripDetail(tripId);
//     successResponse(res, 200, 'Trip full detail fetched', data);
//   } catch (err) {
//     next(err);
//   }
// };

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
    const { title, instruction, location, category, level } = req.body;
    
    // Validation
    if (!title || !instruction || !location || !category) {
      return errorResponse(res, 400, 'Title, instruction, category, and type are required');
    }
    
    if (!['AESTHETIC', 'SECRET_AGENT'].includes(category)) {
      return errorResponse(res, 400, 'Type must be either AESTHETIC or SECRET_AGENT');
    }
    
    if (level && !['NORMAL', 'CRITICAL'].includes(level)) {
      return errorResponse(res, 400, 'Level must be either NORMAL or CRITICAL');
    }
    
    const data = await adminService.createMissionTemplate({
      title,
      instruction,
      location,
      category,
      level: level || 'NORMAL'
    });
    
    successResponse(res, 201, 'Mission template created successfully', data);
  } catch (err) {
    next(err);
  }
};

exports.getAllMissionTemplates = async (req, res, next) => {
  try {
    const { category, level, search } = req.query;
    
    const data = await adminService.getAllMissionTemplates({
      category: category?.toUpperCase(),
      level: level?.toUpperCase(),
      search
    });
    
    // Group data for response
    const response = {
      all: data,
      // aesthetic: data.filter(m => m.type === 'AESTHETIC'),
      // secretAgent: data.filter(m => m.type === 'SECRET_AGENT'),
      // normal: data.filter(m => m.level === 'NORMAL'),
      // critical: data.filter(m => m.level === 'CRITICAL'),
      // stats: {
      //   total: data.length,
      //   aesthetic: data.filter(m => m.type === 'AESTHETIC').length,
      //   secretAgent: data.filter(m => m.type === 'SECRET_AGENT').length,
      //   normal: data.filter(m => m.level === 'NORMAL').length,
      //   critical: data.filter(m => m.level === 'CRITICAL').length
      // }
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
    const { title, instruction, location, category, level } = req.body;
    
    // Validation
    if (category && !['AESTHETIC', 'SECRET_AGENT'].includes(category)) {
      return errorResponse(res, 400, 'Type must be either AESTHETIC or SECRET_AGENT');
    }
    
    if (level && !['NORMAL', 'CRITICAL'].includes(level)) {
      return errorResponse(res, 400, 'Level must be either NORMAL or CRITICAL');
    }
    
    const data = await adminService.updateMissionTemplate(id, {
      title,
      instruction,
      location,
      category,
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

exports.createPrivacyPolicy = async (req, res, next) => {
  try {
    const { contentEn, contentFr } = req.body;
    if (!contentEn || !contentFr) {
      return errorResponse(res, 400, 'Both English and French content are required');
    }

    const data = await adminService.createPrivacyPolicy({ contentEn, contentFr });
    successResponse(res, 201, 'Privacy policy created', data);
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
    if (!data) return errorResponse(res, 404, 'Privacy policy not found');
    successResponse(res, 200, 'Privacy policy fetched', data);
  } catch (err) {
    next(err);
  }
};

exports.updatePrivacyPolicy = async (req, res, next) => {
  try {
    const { contentEn, contentFr, isActive } = req.body;

    const data = await adminService.updatePrivacyPolicy({ contentEn, contentFr, isActive });
    successResponse(res, 200, 'Privacy policy updated', data);
  } catch (err) {
    next(err);
  }
};

exports.deletePrivacyPolicy = async (req, res, next) => {
  try {
    await adminService.deletePrivacyPolicy();
    successResponse(res, 200, 'Privacy policy deleted');
  } catch (err) {
    next(err);
  }
};

// Get payment analytics (admin only)
exports.getPaymentAnalytics = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    
    const analytics = await paymentService.getPaymentAnalytics(startDate, endDate);
    successResponse(res, 200, 'Payment analytics retrieved', analytics);
  } catch (err) {
    next(err);
  }
};

// Manually generate album (admin only)
exports.generateAlbum = async (req, res, next) => {
  try {
    const { tripId } = req.params;
    
    const result = await albumService.generateTripAlbum(tripId);
    successResponse(res, 200, 'Album generated successfully', result);
  } catch (err) {
    next(err);
  }
};

// Refund payment (admin only)
exports.refundPayment = async (req, res, next) => {
  try {
    const { paymentId } = req.params;
    const { reason } = req.body;
    
    const refund = await paymentService.refundPayment(paymentId, reason);
    successResponse(res, 200, 'Payment refunded successfully', refund);
  } catch (err) {
    next(err);
  }
};

// Manually activate trip (admin/creator only)
exports.manuallyActivateTrip = async (req, res, next) => {
  try {
    const { tripId } = req.params;
    const creatorId = req.user.id;
    
    const missionScheduler = require('../services/missionScheduler.service');
    const result = await missionScheduler.manuallyActivateTrip(tripId, creatorId);
    
    successResponse(res, 200, 'Trip activated manually', {
      tripId: result.id,
      name: result.name,
      status: result.status
    });
  } catch (err) {
    next(err);
  }
};


exports.getFullTripDetail = async (req, res, next) => {
  try {
    const { tripId } = req.params;

    if (!tripId) {
      return errorResponse(res, 400, 'Trip ID is required');
    }

    const tripDetails = await adminService.getTripFullDetail(tripId);

    successResponse(res, 200, 'Trip details fetched successfully', tripDetails);
  } catch (error) {
    console.error('❌ Admin getFullTripDetail error:', error);
    next(error);
  }
};


exports.downloadPDFByPath = async (req, res, next) => {
  try {
    const { pdfUrl } = req.body;

    if (!pdfUrl) {
      return errorResponse(res, 400, 'PDF URL is required');
    }

    // Validate local URL only (for security)
    if (!pdfUrl.startsWith(`${process.env.BACKEND_URL}/uploads/albums/`)) {
      return errorResponse(res, 400, 'Invalid PDF URL - must be from local uploads directory');
    }

    console.log(`🔗 Downloading PDF from URL: ${pdfUrl}`);

    // Extract clean file name for attachment
    const originalFilename = pdfUrl.split('/').pop();
    const isHD = pdfUrl.includes('hd') || originalFilename.includes('hd');
    const cleanFilename = `Trip_Album_${isHD ? 'HD' : 'Standard'}.pdf`;
    
    console.log(`📄 Generated filename: ${cleanFilename}`);

    try {
      // Fetch PDF from URL as stream with timeout
      const fileResponse = await axios({
        method: 'GET',
        url: pdfUrl,
        responseType: 'stream',
        timeout: 30000, // 30 seconds timeout
        headers: {
          'User-Agent': 'Internal-PDF-Downloader'
        }
      });

      // Get content length if available
      const contentLength = fileResponse.headers['content-length'];
      
      // Set download headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${cleanFilename}"`);
      res.setHeader('Cache-Control', 'no-cache');
      
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }

      console.log(`📦 Streaming PDF: ${cleanFilename} (${contentLength ? `${contentLength} bytes` : 'unknown size'})`);

      // Handle stream errors
      fileResponse.data.on('error', (streamError) => {
        console.error('❌ Stream error:', streamError);
        if (!res.headersSent) {
          return errorResponse(res, 500, 'Error streaming PDF file');
        }
      });

      // Handle successful completion
      fileResponse.data.on('end', () => {
        console.log(`✅ PDF download completed: ${cleanFilename}`);
      });

      // Pipe stream to response
      fileResponse.data.pipe(res);

    } catch (axiosError) {
      console.error('❌ Axios error downloading PDF:', axiosError.message);
      
      if (axiosError.code === 'ECONNREFUSED') {
        return errorResponse(res, 503, 'PDF service temporarily unavailable');
      } else if (axiosError.response && axiosError.response.status === 404) {
        return errorResponse(res, 404, 'PDF file not found on server');
      } else if (axiosError.code === 'ENOTFOUND') {
        return errorResponse(res, 400, 'Invalid PDF URL');
      } else if (axiosError.code === 'ETIMEDOUT') {
        return errorResponse(res, 408, 'Request timeout - PDF file too large or server slow');
      } else {
        return errorResponse(res, 500, 'Unable to fetch PDF file');
      }
    }

  } catch (error) {
    console.error('❌ Error in downloadPDFByURL:', error);
    if (!res.headersSent) {
      return errorResponse(res, 500, 'Internal server error while downloading PDF');
    }
  }
};

