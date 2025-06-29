// src/services/notification.service.js
const admin = require('firebase-admin');
const { prisma } = require('../config/prisma');

// Initialize Firebase Admin - only if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

// ==================== DATABASE NOTIFICATION FUNCTIONS ====================

// Create notification in database (using NotificationHistory model)
exports.createNotification = async ({ userId, title, body, type, data = {} }) => {
  try {
    const notification = await prisma.notificationHistory.create({
      data: {
        userId,
        title,
        body,
        type,
        data: data, // Already JSON in schema
        read: false,
        sentAt: new Date(),
        success: true
      }
    });

    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

// Get user notifications with pagination (using NotificationHistory)
exports.getUserNotifications = async ({ userId, page = 1, limit = 20 }) => {
  try {
    const skip = (page - 1) * limit;

    const [notifications, totalCount] = await Promise.all([
      prisma.notificationHistory.findMany({
        where: { userId },
        orderBy: { sentAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          body: true,
          type: true,
          data: true,
          read: true,
          sentAt: true
        }
      }),
      prisma.notificationHistory.count({
        where: { userId }
      })
    ]);

    // Format notifications with timeAgo
    const formattedNotifications = notifications.map(notification => ({
      ...notification,
      isRead: notification.read, // Map 'read' to 'isRead' for consistency
      createdAt: notification.sentAt, // Map 'sentAt' to 'createdAt' for consistency
      timeAgo: getTimeAgo(notification.sentAt)
    }));

    return {
      notifications: formattedNotifications,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        hasMore: page * limit < totalCount
      }
    };
  } catch (error) {
    console.error('Error fetching user notifications:', error);
    throw error;
  }
};

// Get unread notification count (using NotificationHistory)
exports.getUnreadNotificationCount = async (userId) => {
  try {
    const count = await prisma.notificationHistory.count({
      where: {
        userId,
        read: false
      }
    });

    return count;
  } catch (error) {
    console.error('Error getting unread count:', error);
    throw error;
  }
};

// Mark notification as read (using NotificationHistory)
exports.markNotificationAsRead = async ({ notificationId, userId }) => {
  try {
    // Verify notification belongs to user
    const notification = await prisma.notificationHistory.findFirst({
      where: {
        id: notificationId,
        userId
      }
    });

    if (!notification) {
      throw new Error('Notification not found or access denied');
    }

    const updatedNotification = await prisma.notificationHistory.update({
      where: { id: notificationId },
      data: { 
        read: true
      }
    });

    return {
      ...updatedNotification,
      isRead: updatedNotification.read, // Map for consistency
      readAt: new Date() // Add readAt for consistency
    };
  } catch (error) {
    console.error('Error marking notification as read:', error);
    throw error;
  }
};

// Mark all notifications as read (using NotificationHistory)
exports.markAllNotificationsAsRead = async (userId) => {
  try {
    const result = await prisma.notificationHistory.updateMany({
      where: {
        userId,
        read: false
      },
      data: {
        read: true
      }
    });

    return { updatedCount: result.count };
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    throw error;
  }
};

// Delete specific notification (using NotificationHistory)
exports.deleteNotification = async ({ notificationId, userId }) => {
  try {
    // Verify notification belongs to user
    const notification = await prisma.notificationHistory.findFirst({
      where: {
        id: notificationId,
        userId
      }
    });

    if (!notification) {
      throw new Error('Notification not found or access denied');
    }

    await prisma.notificationHistory.delete({
      where: { id: notificationId }
    });

    return { message: 'Notification deleted successfully' };
  } catch (error) {
    console.error('Error deleting notification:', error);
    throw error;
  }
};

// Delete all notifications for user (using NotificationHistory)
exports.deleteAllUserNotifications = async (userId) => {
  try {
    const result = await prisma.notificationHistory.deleteMany({
      where: { userId }
    });

    return { deletedCount: result.count };
  } catch (error) {
    console.error('Error deleting all notifications:', error);
    throw error;
  }
};

// Update user FCM token (Enhanced)
exports.updateUserFCMToken = async ({ userId, fcmToken }) => {
  try {
    // Validate FCM token format (basic validation)
    if (!fcmToken || fcmToken.length < 50) {
      throw new Error('Invalid FCM token format');
    }

    // Check if token is already associated with another user
    const existingUser = await prisma.user.findFirst({
      where: {
        fcmToken: fcmToken,
        id: { not: userId }
      }
    });

    // If token exists for another user, remove it (device switched)
    if (existingUser) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { fcmToken: null }
      });
      console.log(`Removed FCM token from user ${existingUser.id} (device switched)`);
    }

    // Update user's FCM token
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { 
        fcmToken: fcmToken,
        lastActive: new Date()
      },
      select: {
        id: true,
        displayName: true,
        fcmToken: true
      }
    });

    return updatedUser;
  } catch (error) {
    console.error('Error updating FCM token:', error);
    throw error;
  }
};

// Send test notification to user
exports.sendTestNotificationToUser = async ({ userId, title, body, type }) => {
  try {
    // Create notification in database
    await exports.createNotification({
      userId,
      title,
      body,
      type,
      data: { test: true }
    });

    // Send FCM notification
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fcmToken: true, displayName: true }
    });

    if (user?.fcmToken) {
      const message = {
        token: user.fcmToken,
        notification: {
          title,
          body
        },
        data: {
          type,
          test: 'true',
          timestamp: new Date().toISOString()
        },
        android: {
          notification: {
            icon: 'ic_notification',
            color: '#667eea',
            channelId: 'test_notifications'
          }
        },
        apns: {
          payload: {
            aps: {
              badge: 1,
              sound: 'default'
            }
          }
        }
      };

      const response = await admin.messaging().send(message);
      console.log('Test notification sent successfully:', response);
    }

    return { success: true, message: 'Test notification sent' };
  } catch (error) {
    console.error('Error sending test notification:', error);
    throw error;
  }
};

// ==================== EXISTING FCM FUNCTIONS (UPDATED) ====================

// Send notification for join request
exports.sendJoinRequestNotification = async ({ creatorId, requesterName, tripName, alias }) => {
  try {
    const creator = await prisma.user.findUnique({
      where: { id: creatorId },
      select: { fcmToken: true, displayName: true }
    });

    if (!creator?.fcmToken) {
      console.log('No FCM token found for creator');
      return;
    }

    const message = {
      token: creator.fcmToken,
      notification: {
        title: '🕵️ Nouvelle demande d\'agent !',
        body: `${requesterName} veut rejoindre "${tripName}" en tant que ${alias}`
      },
      data: {
        type: 'JOIN_REQUEST',
        tripName,
        requesterName,
        alias,
        creatorId,
        action: 'view_requests'
      },
      android: {
        notification: {
          icon: 'ic_notification',
          color: '#667eea',
          channelId: 'trip_requests'
        }
      },
      apns: {
        payload: {
          aps: {
            badge: 1,
            sound: 'default'
          }
        }
      }
    };

    const response = await admin.messaging().send(message);
    console.log('Join request notification sent:', response);
    return response;
  } catch (error) {
    console.error('Error sending join request notification:', error);
    throw error;
  }
};

// Send notification for request approval/rejection
exports.sendRequestResponseNotification = async ({ userId, tripName, alias, approved, creatorName }) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fcmToken: true, displayName: true }
    });

    if (!user?.fcmToken) {
      console.log('No FCM token found for user');
      return;
    }

    const title = approved ? '🎉 Mission acceptée !' : '❌ Mission refusée';
    const body = approved 
      ? `Bienvenue agent ${alias} ! Tu fais maintenant partie de "${tripName}"`
      : `Désolé agent ${alias}, ta demande pour "${tripName}" a été refusée`;

    const message = {
      token: user.fcmToken,
      notification: {
        title,
        body
      },
      data: {
        type: approved ? 'REQUEST_APPROVED' : 'REQUEST_REJECTED',
        tripName,
        alias,
        creatorName,
        approved: approved.toString()
      },
      android: {
        notification: {
          icon: 'ic_notification',
          color: approved ? '#4CAF50' : '#F44336',
          channelId: 'trip_responses'
        }
      },
      apns: {
        payload: {
          aps: {
            badge: 1,
            sound: 'default'
          }
        }
      }
    };

    const response = await admin.messaging().send(message);
    console.log('Request response notification sent:', response);
    return response;
  } catch (error) {
    console.error('Error sending request response notification:', error);
    throw error;
  }
};

// Send mission assignment notification
exports.sendMissionAssignedNotification = async ({ userId, missionTitle, tripName, alias }) => {
  try {
    // Create notification in database first
    await exports.createNotification({
      userId,
      title: '🎯 Nouvelle mission secrète !',
      body: `Agent ${alias}, tu as reçu une nouvelle mission : "${missionTitle}"`,
      type: 'NEW_MISSION',
      data: {
        missionTitle,
        tripName,
        alias,
        action: 'view_missions'
      }
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fcmToken: true }
    });

    if (!user?.fcmToken) {
      console.log('No FCM token found for user');
      return;
    }

    const message = {
      token: user.fcmToken,
      notification: {
        title: '🎯 Nouvelle mission secrète !',
        body: `Agent ${alias}, tu as reçu une nouvelle mission : "${missionTitle}"`
      },
      data: {
        type: 'NEW_MISSION',
        missionTitle,
        tripName,
        alias,
        action: 'view_missions'
      },
      android: {
        notification: {
          icon: 'ic_notification',
          color: '#667eea',
          channelId: 'missions'
        }
      },
      apns: {
        payload: {
          aps: {
            badge: 1,
            sound: 'default'
          }
        }
      }
    };

    const response = await admin.messaging().send(message);
    console.log('Mission notification sent:', response);
    return response;
  } catch (error) {
    console.error('Error sending mission notification:', error);
    throw error;
  }
};

// Send trip activation notification
exports.sendTripActivationNotification = async ({ tripId, tripName }) => {
  try {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        members: {
          select: { 
            id: true, 
            fcmToken: true,
            displayName: true 
          }
        },
        tripAliases: true
      }
    });

    if (!trip) {
      throw new Error('Trip not found');
    }

    // Create notifications in database for all members
    for (const member of trip.members) {
      const alias = trip.tripAliases.find(ta => ta.userId === member.id)?.alias || 'Agent';
      
      await exports.createNotification({
        userId: member.id,
        title: '🚀 Mission activée !',
        body: `Agent ${alias}, le voyage "${tripName}" a commencé ! Tes missions t'attendent.`,
        type: 'TRIP_ACTIVATED',
        data: {
          tripId,
          tripName,
          alias,
          action: 'view_missions'
        }
      });
    }

    const notifications = trip.members
      .filter(member => member.fcmToken)
      .map(member => {
        const alias = trip.tripAliases.find(ta => ta.userId === member.id)?.alias || 'Agent';
        
        return {
          token: member.fcmToken,
          notification: {
            title: '🚀 Mission activée !',
            body: `Agent ${alias}, le voyage "${tripName}" a commencé ! Tes missions t'attendent.`
          },
          data: {
            type: 'TRIP_ACTIVATED',
            tripName,
            tripId,
            alias,
            action: 'view_missions'
          },
          android: {
            notification: {
              icon: 'ic_notification',
              color: '#4CAF50',
              channelId: 'trip_updates'
            }
          }
        };
      });

    if (notifications.length === 0) {
      console.log('No FCM tokens found for trip members');
      return;
    }

    const response = await admin.messaging().sendAll(notifications);
    console.log(`Trip activation notifications sent: ${response.successCount}/${notifications.length}`);
    return response;
  } catch (error) {
    console.error('Error sending trip activation notifications:', error);
    throw error;
  }
};

// Update user FCM token (Simple version for backward compatibility)
exports.updateFCMToken = async ({ userId, fcmToken }) => {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { fcmToken }
    });
    console.log('FCM token updated for user:', userId);
  } catch (error) {
    console.error('Error updating FCM token:', error);
    throw error;
  }
};

// Send bulk notifications
exports.sendBulkNotifications = async (notifications) => {
  try {
    const response = await admin.messaging().sendAll(notifications);
    console.log(`Bulk notifications sent: ${response.successCount}/${notifications.length}`);
    
    // Handle failed notifications
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(notifications[idx].token);
          console.error('Failed to send to token:', notifications[idx].token, resp.error);
        }
      });
    }
    
    return response;
  } catch (error) {
    console.error('Error sending bulk notifications:', error);
    throw error;
  }
};

// Send album ready notification
exports.sendAlbumReadyNotification = async ({ userId, tripName, alias, albumId }) => {
  try {
    // Create notification in database
    await exports.createNotification({
      userId,
      title: '📸 Album de mission prêt !',
      body: `Agent ${alias}, l'album de "${tripName}" est maintenant disponible !`,
      type: 'ALBUM_READY',
      data: {
        tripName,
        alias,
        albumId,
        action: 'view_album'
      }
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fcmToken: true }
    });

    if (!user?.fcmToken) {
      console.log('No FCM token found for user');
      return;
    }

    const message = {
      token: user.fcmToken,
      notification: {
        title: '📸 Album de mission prêt !',
        body: `Agent ${alias}, l'album de "${tripName}" est maintenant disponible !`
      },
      data: {
        type: 'ALBUM_READY',
        tripName,
        alias,
        albumId,
        action: 'view_album'
      },
      android: {
        notification: {
          icon: 'ic_notification',
          color: '#4CAF50',
          channelId: 'album_updates'
        }
      },
      apns: {
        payload: {
          aps: {
            badge: 1,
            sound: 'default'
          }
        }
      }
    };

    const response = await admin.messaging().send(message);
    console.log('Album ready notification sent:', response);
    return response;
  } catch (error) {
    console.error('Error sending album ready notification:', error);
    throw error;
  }
};

// Send HD album available notification
exports.sendHDAlbumAvailableNotification = async ({ userId, tripName, alias, purchaserName, albumId }) => {
  try {
    // Create notification in database
    await exports.createNotification({
      userId,
      title: '🌟 Album HD débloqué !',
      body: `Agent ${alias}, ${purchaserName} a débloqué l'album HD de "${tripName}" pour toute l'équipe !`,
      type: 'HD_ALBUM_AVAILABLE',
      data: {
        tripName,
        alias,
        purchaserName,
        albumId,
        action: 'view_hd_album'
      }
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fcmToken: true }
    });

    if (!user?.fcmToken) {
      console.log('No FCM token found for user');
      return;
    }

    const message = {
      token: user.fcmToken,
      notification: {
        title: '🌟 Album HD débloqué !',
        body: `Agent ${alias}, ${purchaserName} a débloqué l'album HD de "${tripName}" pour toute l'équipe !`
      },
      data: {
        type: 'HD_ALBUM_AVAILABLE',
        tripName,
        alias,
        purchaserName,
        albumId,
        action: 'view_hd_album'
      },
      android: {
        notification: {
          icon: 'ic_notification',
          color: '#FFD700',
          channelId: 'album_updates'
        }
      },
      apns: {
        payload: {
          aps: {
            badge: 1,
            sound: 'default'
          }
        }
      }
    };

    const response = await admin.messaging().send(message);
    console.log('HD album available notification sent:', response);
    return response;
  } catch (error) {
    console.error('Error sending HD album notification:', error);
    throw error;
  }
};

// Send mission completion reminder
exports.sendMissionReminderNotification = async ({ userId, tripName, alias, pendingMissions }) => {
  try {
    // Create notification in database
    await exports.createNotification({
      userId,
      title: '⏰ Missions en attente',
      body: `Agent ${alias}, tu as ${pendingMissions} mission${pendingMissions > 1 ? 's' : ''} en attente pour "${tripName}"`,
      type: 'MISSION_REMINDER',
      data: {
        tripName,
        alias,
        pendingMissions,
        action: 'view_missions'
      }
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fcmToken: true }
    });

    if (!user?.fcmToken) {
      console.log('No FCM token found for user');
      return;
    }

    const message = {
      token: user.fcmToken,
      notification: {
        title: '⏰ Missions en attente',
        body: `Agent ${alias}, tu as ${pendingMissions} mission${pendingMissions > 1 ? 's' : ''} en attente pour "${tripName}"`
      },
      data: {
        type: 'MISSION_REMINDER',
        tripName,
        alias,
        pendingMissions: pendingMissions.toString(),
        action: 'view_missions'
      },
      android: {
        notification: {
          icon: 'ic_notification',
          color: '#FF9800',
          channelId: 'mission_reminders'
        }
      }
    };

    const response = await admin.messaging().send(message);
    console.log('Mission reminder notification sent:', response);
    return response;
  } catch (error) {
    console.error('Error sending mission reminder notification:', error);
    throw error;
  }
};

// Send notification when someone joins a trip (Enhanced with DB storage)
exports.sendMemberJoinedNotification = async ({ creatorId, newMemberName, tripName, alias, creatorName }) => {
  try {
    // Create notification in database
    await exports.createNotification({
      userId: creatorId,
      title: '🎉 Nouvel agent rejoint !',
      body: `${newMemberName} a rejoint "${tripName}" en tant que ${alias} !`,
      type: 'MEMBER_JOINED',
      data: {
        tripName,
        newMemberName,
        alias,
        action: 'view_trip_members'
      }
    });

    // Send FCM notification
    const user = await prisma.user.findUnique({
      where: { id: creatorId },
      select: { fcmToken: true }
    });

    if (!user?.fcmToken) {
      console.log('No FCM token found for trip creator');
      return;
    }

    const message = {
      token: user.fcmToken,
      notification: {
        title: '🎉 Nouvel agent rejoint !',
        body: `${newMemberName} a rejoint "${tripName}" en tant que ${alias} !`
      },
      data: {
        type: 'MEMBER_JOINED',
        tripName,
        newMemberName,
        alias,
        action: 'view_trip_members'
      },
      android: {
        notification: {
          icon: 'ic_notification',
          color: '#4CAF50',
          channelId: 'trip_updates'
        }
      },
      apns: {
        payload: {
          aps: {
            badge: 1,
            sound: 'default'
          }
        }
      }
    };

    const response = await admin.messaging().send(message);
    console.log('Member joined notification sent:', response);
    return response;
  } catch (error) {
    console.error('Error sending member joined notification:', error);
    throw error;
  }
};

// ==================== HELPER FUNCTIONS ====================

// Helper function to calculate time ago
function getTimeAgo(date) {
  const now = new Date();
  const diff = now - new Date(date);
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}