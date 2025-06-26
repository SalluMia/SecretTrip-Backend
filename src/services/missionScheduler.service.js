// src/services/missionScheduler.service.js
const { prisma } = require('../config/prisma');
const { shuffleArray, tripDurationDays } = require('../utils/helpers');
const notificationService = require('./notification.service');
const cron = require('node-cron');

class MissionSchedulerService {
  constructor() {
    this.startScheduler();
  }

  // Start the cron job to check for trips that should begin
  startScheduler() {
    // Run every hour to check for trips that should start
    cron.schedule('0 * * * *', async () => {
      console.log('🕒 Checking for trips to activate...');
      await this.checkAndActivateTrips();
    });

    // Run daily at 6 AM to assign daily missions
    cron.schedule('0 6 * * *', async () => {
      console.log('🎯 Assigning daily missions...');
      await this.assignDailyMissions();
    });

    // Check for trips to end every hour at 30 minutes past
    cron.schedule('30 * * * *', async () => {
      console.log('🏁 Checking for trips to end...');
      await this.checkTripsToEnd();
    });
  }

  // Check for trips that should be activated (start date reached)
  async checkAndActivateTrips() {
    try {
      const now = new Date();
      const tripsToActivate = await prisma.trip.findMany({
        where: {
          status: 'UPCOMING',
          startDate: {
            lte: now
          }
        },
        include: {
          members: true,
          tripAliases: true
        }
      });

      for (const trip of tripsToActivate) {
        await this.activateTripAndAssignMissions(trip);
      }
    } catch (error) {
      console.error('Error checking trips to activate:', error);
    }
  }

  // Activate trip and assign initial missions
  async activateTripAndAssignMissions(trip) {
    try {
      console.log(`🚀 Activating trip: ${trip.name}`);

      // Calculate mission distribution according to DEV FILE algorithm
      const missionDistribution = this.calculateMissionDistribution(trip);
      
      // Get mission templates based on trip theme
      const missionTemplates = await this.getMissionTemplates(trip.theme, trip.tripMode);
      
      // Assign first day missions to all members
      await this.assignInitialMissions(trip, missionTemplates, missionDistribution);
      
      // Update trip status
      await prisma.trip.update({
        where: { id: trip.id },
        data: { 
          status: 'ACTIVE',
          totalMissions: missionDistribution.totalMissions
        }
      });

      // Send activation notifications
      await notificationService.sendTripActivationNotification({
        tripId: trip.id,
        tripName: trip.name
      });

      console.log(`✅ Trip "${trip.name}" activated with ${missionDistribution.totalMissions} total missions planned`);
    } catch (error) {
      console.error(`Error activating trip ${trip.id}:`, error);
    }
  }

  // Calculate mission distribution according to DEV FILE algorithm
  calculateMissionDistribution(trip) {
    const N = trip.members.length; // Number of participants
    const D = tripDurationDays(trip.startDate, trip.endDate); // Duration in days
    
    // Algorithm from DEV FILE:
    // 1. Set base goal of 80-100 photos per trip
    // 2. If N × D < 40, then X = 100, else X = 80
    const X = (N * D < 40) ? 100 : 80; // Target number of photos
    
    // 3. M = ceil(X / N) → total missions per user
    const M = Math.ceil(X / N);
    
    // 4. m = ceil(M / D) → missions per user per day
    const m = Math.ceil(M / D);

    return {
      participantCount: N,
      durationDays: D,
      targetPhotos: X,
      missionsPerUser: M,
      missionsPerUserPerDay: m,
      totalMissions: N * M
    };
  }

  // Get mission templates based on theme and mode
  async getMissionTemplates(theme, tripMode) {
    const whereClause = {
      isActive: true
    };

    if (tripMode === 'fun') {
      // Fun mode: mix of aesthetic and secret agent (2/7 chance for fun missions)
      whereClause.category = {
        in: ['AESTHETIC', 'SECRET_AGENT']
      };
    } else {
      // Normal mode: only aesthetic
      whereClause.category = 'AESTHETIC';
    }

    const templates = await prisma.missionTemplate.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' }
    });

    if (templates.length === 0) {
      throw new Error(`No mission templates found for theme: ${theme}, mode: ${tripMode}`);
    }

    return templates;
  }

  // Assign initial missions (first day)
  async assignInitialMissions(trip, missionTemplates, distribution) {
    const missions = [];

    for (const member of trip.members) {
      // Assign first day missions
      const dailyMissions = this.selectMissionsForUser(
        missionTemplates, 
        distribution.missionsPerUserPerDay,
        trip.tripMode
      );

      for (const mission of dailyMissions) {
        missions.push({
          userId: member.id,
          tripId: trip.id,
          title: mission.title,
          instruction: mission.instruction,
          category: mission.category,
          sampleImageUrl: mission.sampleImageUrl,
          dayAssigned: 1,
          createdAt: new Date()
        });
      }
    }

    // Bulk create first day missions
    await prisma.assignedMission.createMany({
      data: missions
    });

    // Send mission notifications to all members
    for (const member of trip.members) {
      const alias = trip.tripAliases.find(ta => ta.userId === member.id)?.alias || 'Agent';
      await notificationService.sendMissionAssignedNotification({
        userId: member.id,
        missionTitle: `${distribution.missionsPerUserPerDay} nouvelle${distribution.missionsPerUserPerDay > 1 ? 's' : ''} mission${distribution.missionsPerUserPerDay > 1 ? 's' : ''}`,
        tripName: trip.name,
        alias
      });
    }
  }

  // Select missions for a specific user
  selectMissionsForUser(templates, count, tripMode) {
    let selectedMissions = [];

    if (tripMode === 'fun') {
      // Fun mode: 2/7 chance for secret agent missions
      const aestheticMissions = templates.filter(t => t.category === 'AESTHETIC');
      const secretAgentMissions = templates.filter(t => t.category === 'SECRET_AGENT');
      
      for (let i = 0; i < count; i++) {
        // 2/7 chance for secret agent mission
        const useSecretAgent = Math.random() < (2/7) && secretAgentMissions.length > 0;
        
        if (useSecretAgent) {
          const randomIndex = Math.floor(Math.random() * secretAgentMissions.length);
          selectedMissions.push(secretAgentMissions[randomIndex]);
        } else if (aestheticMissions.length > 0) {
          const randomIndex = Math.floor(Math.random() * aestheticMissions.length);
          selectedMissions.push(aestheticMissions[randomIndex]);
        }
      }
    } else {
      // Normal mode: only aesthetic missions
      selectedMissions = shuffleArray(templates).slice(0, count);
    }

    // If we don't have enough unique missions, allow repeats
    while (selectedMissions.length < count) {
      const randomMission = templates[Math.floor(Math.random() * templates.length)];
      selectedMissions.push(randomMission);
    }

    return selectedMissions;
  }

  // Assign daily missions (for already active trips)
  async assignDailyMissions() {
    try {
      const activeTrips = await prisma.trip.findMany({
        where: {
          status: 'ACTIVE',
          endDate: {
            gte: new Date()
          }
        },
        include: {
          members: true,
          tripAliases: true
        }
      });

      for (const trip of activeTrips) {
        await this.checkDailyMissionAssignment(trip);
      }
    } catch (error) {
      console.error('Error assigning daily missions:', error);
    }
  }

  // Check if daily missions need to be assigned for a trip
  async checkDailyMissionAssignment(trip) {
    try {
      const tripStartDate = new Date(trip.startDate);
      const now = new Date();
      const daysSinceStart = Math.floor((now - tripStartDate) / (1000 * 60 * 60 * 24)) + 1;

      const distribution = this.calculateMissionDistribution(trip);
      const expectedMissionsPerUser = Math.min(
        daysSinceStart * distribution.missionsPerUserPerDay,
        distribution.missionsPerUser
      );

      // Check each member's mission count
      for (const member of trip.members) {
        const currentMissionCount = await prisma.assignedMission.count({
          where: {
            userId: member.id,
            tripId: trip.id
          }
        });

        if (currentMissionCount < expectedMissionsPerUser) {
          const missionsNeeded = expectedMissionsPerUser - currentMissionCount;
          await this.assignAdditionalMissions(trip, member, missionsNeeded, daysSinceStart);
        }
      }
    } catch (error) {
      console.error(`Error checking daily missions for trip ${trip.id}:`, error);
    }
  }

  // Assign additional missions to a specific user
  async assignAdditionalMissions(trip, member, count, dayNumber) {
    try {
      const missionTemplates = await this.getMissionTemplates(trip.theme, trip.tripMode);
      const selectedMissions = this.selectMissionsForUser(missionTemplates, count, trip.tripMode);

      const missions = selectedMissions.map(mission => ({
        userId: member.id,
        tripId: trip.id,
        title: mission.title,
        instruction: mission.instruction,
        category: mission.category,
        sampleImageUrl: mission.sampleImageUrl,
        dayAssigned: dayNumber,
        createdAt: new Date()
      }));

      await prisma.assignedMission.createMany({
        data: missions
      });

      // Send notification
      const alias = trip.tripAliases.find(ta => ta.userId === member.id)?.alias || 'Agent';
      await notificationService.sendMissionAssignedNotification({
        userId: member.id,
        missionTitle: `${count} nouvelle${count > 1 ? 's' : ''} mission${count > 1 ? 's' : ''}`,
        tripName: trip.name,
        alias
      });

      console.log(`📋 Assigned ${count} additional missions to ${member.displayName} in trip ${trip.name}`);
    } catch (error) {
      console.error(`Error assigning additional missions:`, error);
    }
  }

  // Check for trips that should end
  async checkTripsToEnd() {
    try {
      const now = new Date();
      const tripsToEnd = await prisma.trip.findMany({
        where: {
          status: 'ACTIVE',
          endDate: {
            lt: now
          }
        }
      });

      for (const trip of tripsToEnd) {
        await this.endTrip(trip);
      }
    } catch (error) {
      console.error('Error checking trips to end:', error);
    }
  }

  // End a trip and trigger album generation
  async endTrip(trip) {
    try {
      console.log(`🏁 Ending trip: ${trip.name}`);

      // Count completed missions
      const completedMissions = await prisma.assignedMission.count({
        where: {
          tripId: trip.id,
          completed: true
        }
      });

      // Update trip status
      await prisma.trip.update({
        where: { id: trip.id },
        data: { 
          status: 'COMPLETED',
          completedMissions 
        }
      });

      // Generate album (implement this later)
      // const albumService = require('./album.service');
      // await albumService.generateTripAlbum(trip.id);

      console.log(`✅ Trip "${trip.name}" ended with ${completedMissions} completed missions`);
    } catch (error) {
      console.error(`Error ending trip ${trip.id}:`, error);
    }
  }

  // Manual trip activation (for immediate activation)
  async manuallyActivateTrip(tripId, creatorId) {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        members: true,
        tripAliases: true
      }
    });

    if (!trip || trip.creatorId !== creatorId) {
      throw new Error('Unauthorized or trip not found');
    }

    if (trip.status !== 'UPCOMING') {
      throw new Error('Trip is not in upcoming status');
    }

    await this.activateTripAndAssignMissions(trip);
    return trip;
  }
}

// Export singleton instance
module.exports = new MissionSchedulerService();