const cron = require('node-cron');
const missionScheduler = require('../services/missionScheduler.service');

// Start all scheduled jobs
function startScheduledJobs() {
  console.log('🕐 Starting scheduled jobs...');

  // Check for active trips without missions every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    console.log('🔍 Checking for active trips without missions...');
    await checkActiveTripsWithoutMissions();
  });

  // Check for trips that should become active (after 1-hour buffer) every 2 minutes
  cron.schedule('*/2 * * * *', async () => {
    console.log('⏰ Checking for trips that should become active...');
    await checkTripsToActivate();
  });

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

// Check for active trips without missions and assign them immediately
async function checkActiveTripsWithoutMissions() {
  try {
    const { prisma } = require('../config/prisma');
    const missionSchedulerService = require('../services/missionScheduler.service');

    // Find active trips that have no assigned missions
    const activeTripsWithoutMissions = await prisma.trip.findMany({
      where: {
        status: 'ACTIVE',
        assignedMissions: {
          none: {} // No assigned missions
        }
      },
      include: {
        members: true,
        tripAliases: true
      }
    });

    if (activeTripsWithoutMissions.length > 0) {
      console.log(`🎯 Found ${activeTripsWithoutMissions.length} active trips without missions`);
      
      for (const trip of activeTripsWithoutMissions) {
        try {
          console.log(`🚀 Assigning missions to trip: ${trip.name} (ID: ${trip.id})`);
          await missionSchedulerService.assignMissionsToActiveTrip(trip);
          console.log(`✅ Successfully assigned missions to trip: ${trip.name}`);
        } catch (error) {
          console.error(`❌ Failed to assign missions to trip ${trip.id}:`, error);
        }
      }
    } else {
      console.log('✅ All active trips have missions assigned');
    }
  } catch (error) {
    console.error('Error checking active trips without missions:', error);
  }
}

// Check for trips that should become active after 1-hour buffer
async function checkTripsToActivate() {
  try {
    const missionSchedulerService = require('../services/missionScheduler.service');
    
    // Use the existing method in missionSchedulerService
    await missionSchedulerService.checkAndActivateTrips();
  } catch (error) {
    console.error('Error checking trips to activate:', error);
  }
}