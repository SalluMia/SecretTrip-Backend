const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const auth = require('../middlewares/auth');

// Apply authentication middleware to all routes
router.use(auth);

// ==================== NOTIFICATION ROUTES ====================

// Get all notifications for user (with pagination)
// GET /api/notifications?page=1&limit=20
router.get('/', notificationController.getUserNotifications);

// Get unread notification count
// GET /api/notifications/unread-count
router.get('/unread-count', notificationController.getUnreadCount);

// Mark specific notification as read
// PUT /api/notifications/:notificationId/read
router.put('/:notificationId/read', notificationController.markAsRead);

// Mark all notifications as read
// PUT /api/notifications/mark-all-read
router.put('/mark-all-read', notificationController.markAllAsRead);

// Delete specific notification
// DELETE /api/notifications/:notificationId
router.delete('/:notificationId', notificationController.deleteNotification);

// Delete all notifications
// DELETE /api/notifications/clear-all
router.delete('/clear-all', notificationController.deleteAllNotifications);

// Update FCM token
// PUT /api/notifications/fcm-token
router.put('/fcm-token', notificationController.updateFCMToken);

// Test notification endpoint (for development)
// POST /api/notifications/test
router.post('/test', notificationController.sendTestNotification);

module.exports = router;