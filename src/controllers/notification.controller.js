const notificationService = require('../services/notification.service');
const { successResponse, errorResponse } = require('../utils/response');

// Get all notifications for the authenticated user
exports.getUserNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    const data = await notificationService.getUserNotifications({
      userId,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    successResponse(res, 200, 'Notifications retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

// Get unread notification count
exports.getUnreadCount = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    const count = await notificationService.getUnreadNotificationCount(userId);
    
    successResponse(res, 200, 'Unread count retrieved', { unreadCount: count });
  } catch (err) {
    next(err);
  }
};

// Mark specific notification as read
exports.markAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { notificationId } = req.params;

    const data = await notificationService.markNotificationAsRead({
      notificationId,
      userId
    });

    successResponse(res, 200, 'Notification marked as read', data);
  } catch (err) {
    next(err);
  }
};

// Mark all notifications as read
exports.markAllAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const data = await notificationService.markAllNotificationsAsRead(userId);

    successResponse(res, 200, 'All notifications marked as read', data);
  } catch (err) {
    next(err);
  }
};

// Delete a specific notification
exports.deleteNotification = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { notificationId } = req.params;

    const data = await notificationService.deleteNotification({
      notificationId,
      userId
    });

    successResponse(res, 200, 'Notification deleted successfully', data);
  } catch (err) {
    next(err);
  }
};

// Delete all notifications for user
exports.deleteAllNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const data = await notificationService.deleteAllUserNotifications(userId);

    successResponse(res, 200, 'All notifications deleted successfully', data);
  } catch (err) {
    next(err);
  }
};

// Update user's FCM token
exports.updateFCMToken = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { fcmToken } = req.body;

    if (!fcmToken) {
      return errorResponse(res, 400, 'FCM token is required');
    }

    const data = await notificationService.updateUserFCMToken({
      userId,
      fcmToken
    });

    successResponse(res, 200, 'FCM token updated successfully', data);
  } catch (err) {
    next(err);
  }
};

// Test notification endpoint (for development)
exports.sendTestNotification = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { title, body, type = 'TEST' } = req.body;

    if (!title || !body) {
      return errorResponse(res, 400, 'Title and body are required');
    }

    const data = await notificationService.sendTestNotificationToUser({
      userId,
      title,
      body,
      type
    });

    successResponse(res, 200, 'Test notification sent successfully', data);
  } catch (err) {
    next(err);
  }
};