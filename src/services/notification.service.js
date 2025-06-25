// src/services/notification.service.js
const admin = require('firebase-admin');
const { prisma } = require('../config/prisma');

// Initialize Firebase Admin (add this to your main app.js or create a separate config file)
// Make sure to set up your Firebase service account key
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const messaging = admin.messaging();

// Store user FCM tokens (you'll need to add this to your user schema)
// For now, I'll assume you have a way to get user's FCM token

// Send notification for join request
exports.sendJoinRequestNotification = async ({ creatorId, requesterName, tripName, alias }) => {
  try {
    // Get creator's FCM token (you'll need to implement this)
    const creator = await prisma.user.findUnique({
      where: { id: creatorId },
      select: { fcmToken: true, displayName: true } // Add fcmToken field to User model
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

    const response = await messaging.send(message);
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

    const response = await messaging.send(message);
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

    const response = await messaging.send(message);
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

    const response = await messaging.sendAll(notifications);
    console.log(`Trip activation notifications sent: ${response.successCount}/${notifications.length}`);
    return response;
  } catch (error) {
    console.error('Error sending trip activation notifications:', error);
    throw error;
  }
};

// Update user FCM token
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
    const response = await messaging.sendAll(notifications);
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
      
      // Optionally remove invalid tokens from database
      // await this.removeInvalidTokens(failedTokens);
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

    const response = await messaging.send(message);
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

    const response = await messaging.send(message);
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

    const response = await messaging.send(message);
    console.log('Mission reminder notification sent:', response);
    return response;
  } catch (error) {
    console.error('Error sending mission reminder notification:', error);
    throw error;
  }
};