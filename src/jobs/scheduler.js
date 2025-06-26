const cron = require('node-cron');
const missionScheduler = require('../services/missionScheduler.service');

// Start all scheduled jobs
function startScheduledJobs() {
  console.log('🕐 Starting scheduled jobs...');

  // Send mission reminders daily at 8 PM
  cron.schedule('0 20 * * *', async () => {
    console.log('⏰ Sending mission reminders...');
    await sendMissionReminders();
  });

  console.log('✅ Scheduled jobs started');
}

// Send mission reminders to users with pending missions
async function sendMissionReminders() {
  try {
    const { prisma } = require('../config/prisma');
    const notificationService = require('../services/notification.service');

    // Get users with pending missions in active trips
    const usersWithPendingMissions = await prisma.user.findMany({
      where: {
        assignedMissions: {
          some: {
            completed: false,
            trip: {
              status: 'ACTIVE'
            }
          }
        }
      },
      include: {
        assignedMissions: {
          where: {
            completed: false,
            trip: {
              status: 'ACTIVE'
            }
          },
          include: {
            trip: {
              select: {
                name: true,
                id: true
              }
            }
          }
        },
        tripAliases: true
      }
    });

    for (const user of usersWithPendingMissions) {
      // Group missions by trip
      const missionsByTrip = user.assignedMissions.reduce((acc, mission) => {
        const tripId = mission.trip.id;
        if (!acc[tripId]) {
          acc[tripId] = {
            tripName: mission.trip.name,
            missions: []
          };
        }
        acc[tripId].missions.push(mission);
        return acc;
      }, {});

      // Send reminder for each trip
      for (const [tripId, tripData] of Object.entries(missionsByTrip)) {
        const alias = user.tripAliases.find(ta => ta.tripId === tripId)?.alias || 'Agent';
        
        try {
          await notificationService.sendMissionReminderNotification({
            userId: user.id,
            tripName: tripData.tripName,
            alias,
            pendingMissions: tripData.missions.length
          });
        } catch (error) {
          console.error(`Failed to send reminder to user ${user.id}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('Error sending mission reminders:', error);
  }
}

module.exports = { startScheduledJobs };