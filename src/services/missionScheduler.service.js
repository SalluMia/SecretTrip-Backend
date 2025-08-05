// src/services/missionScheduler.service.js - FIXED VERSION
const { prisma } = require('../config/prisma');
const { shuffleArray, tripDurationDays } = require('../utils/helpers');
const notificationService = require('./notification.service');
const albumService = require('./album.service');
const cron = require('node-cron');

class MissionSchedulerService {
  constructor() {
    this.startScheduler();
  }

  // Start the cron job to check for trips that should begin
  startScheduler() {
    // Trip activation is now handled by scheduler.js every 2 minutes
    // This prevents conflicts and ensures consistent timing
    // cron.schedule('*/30 * * * *', async () => {
    //   console.log('🕒 Checking for trips to activate...');
    //   await this.checkAndActivateTrips();
    // });

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

  // ✅ FIXED: Check for trips that should be activated (start date reached)
  async checkAndActivateTrips() {
    try {
      const now = new Date();
      
      // Set the time to start of day for comparison to avoid timezone issues
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      console.log(`🔍 Checking trips that should start today: ${today.toISOString()}`);

      const tripsToActivate = await prisma.trip.findMany({
        where: {
          status: 'UPCOMING',
          AND: [
            {
              startDate: {
                lte: now // Trip start date is today or earlier
              }
            }
          ]
        },
        include: {
          members: true,
          tripAliases: true
        }
      });

      console.log(`📋 Found ${tripsToActivate.length} trips to potentially activate`);

      for (const trip of tripsToActivate) {
        const tripStartDate = new Date(trip.startDate);
        const tripStartDay = new Date(tripStartDate.getFullYear(), tripStartDate.getMonth(), tripStartDate.getDate());
        const tripCreatedAt = new Date(trip.createdAt);
        const tripCreatedDay = new Date(tripCreatedAt.getFullYear(), tripCreatedAt.getMonth(), tripCreatedAt.getDate());
        
        // ✅ FIXED: Add 1-hour buffer logic based on creation time, not start time
        const oneHourAfterCreation = new Date(tripCreatedAt);
        oneHourAfterCreation.setHours(oneHourAfterCreation.getHours() + 1);
        
        // ✅ LOGIC: For trips created today, apply 1-hour buffer from creation time
        const isCreatedToday = tripCreatedDay.getTime() === today.getTime();
        const isStartDateToday = tripStartDay.getTime() === today.getTime();
        
        console.log(`🚀 Trip "${trip.name}": Start date is ${tripStartDay.toISOString()}, Today is ${today.toISOString()}`);
        console.log(`⏰ Trip created at: ${tripCreatedAt.toLocaleString()}`);
        console.log(`⏰ Trip start time: ${tripStartDate.toLocaleString()}`);
        console.log(`⏰ 1 hour after creation: ${oneHourAfterCreation.toLocaleString()}`);
        console.log(`⏰ Current time: ${now.toLocaleString()}`);
        console.log(`📅 Created today: ${isCreatedToday ? 'Yes' : 'No'}, Start date today: ${isStartDateToday ? 'Yes' : 'No'}`);
        
        if (isCreatedToday && now >= oneHourAfterCreation) {
          console.log(`✅ Trip "${trip.name}" ready to activate (1 hour buffer passed since creation)`);
          await this.activateTripAndAssignMissions(trip);
        } else if (isCreatedToday) {
          const timeRemaining = Math.ceil((oneHourAfterCreation - now) / (1000 * 60)); // minutes
          console.log(`⏳ Trip "${trip.name}" not ready to activate yet. ${timeRemaining} minutes remaining in buffer.`);
        } else if (tripStartDay <= today) {
          // Trip created earlier but start date is today or past (no buffer needed)
          console.log(`✅ Trip "${trip.name}" ready to activate (trip created earlier, start date reached)`);
          await this.activateTripAndAssignMissions(trip);
        } else {
          console.log(`⏳ Trip "${trip.name}" not ready to activate yet (future date)`);
        }
      }
    } catch (error) {
      console.error('Error checking trips to activate:', error);
    }
  }

  // ✅ FIXED: Activate trip and assign initial missions with proper mission distribution
  async activateTripAndAssignMissions(trip) {
    try {
      console.log(`🚀 Activating trip: ${trip.name} (ID: ${trip.id})`);

      // Calculate mission distribution according to DEV FILE algorithm
      const missionDistribution = this.calculateMissionDistribution(trip);
      
      console.log(`📊 Mission distribution for "${trip.name}":`, {
        participants: missionDistribution.participantCount,
        duration: missionDistribution.durationDays,
        targetPhotos: missionDistribution.targetPhotos,
        missionsPerUser: missionDistribution.missionsPerUser,
        missionsPerUserPerDay: missionDistribution.missionsPerUserPerDay,
        totalMissions: missionDistribution.totalMissions
      });
      
      // Get mission templates based on trip theme
      const missionTemplates = await this.getMissionTemplates(trip.theme, trip.tripMode);
      console.log(`🎯 Found ${missionTemplates.length} mission templates for theme: ${trip.theme}, mode: ${trip.tripMode}`);
      
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

      console.log(`✅ Trip "${trip.name}" activated successfully with ${missionDistribution.totalMissions} total missions planned`);
    } catch (error) {
      console.error(`❌ Error activating trip ${trip.id}:`, error);
    }
  }

  // ✅ FIXED: Calculate mission distribution according to DEV FILE algorithm
  calculateMissionDistribution(trip) {
    const N = trip.members.length; // Number of participants
    const D = tripDurationDays(trip.startDate, trip.endDate); // Duration in days
    
    console.log(`📐 Calculating mission distribution: N=${N} participants, D=${D} days`);
    
    // Algorithm from DEV FILE:
    // 1. Set base goal of 80-100 photos per trip
    // 2. If N × D < 40, then X = 100, else X = 80
    const X = (N * D < 40) ? 100 : 80; // Target number of photos
    
    // 3. M = ceil(X / N) → total missions per user
    const M = Math.ceil(X / N);
    
    // 4. m = ceil(M / D) → missions per user per day
    const m = Math.ceil(M / D);

    console.log(`🎯 Mission calculation: X=${X} target photos, M=${M} per user, m=${m} per user per day`);

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

  // ✅ FIXED: Assign initial missions with proper template relationship
  async assignInitialMissions(trip, missionTemplates, distribution) {
    const missions = [];

    console.log(`🎯 Assigning initial missions for ${trip.members.length} members`);

    for (const member of trip.members) {
      // Assign first day missions
      const dailyMissions = this.selectMissionsForUser(
        missionTemplates, 
        distribution.missionsPerUserPerDay,
        trip.tripMode
      );

      console.log(`👤 Assigning ${dailyMissions.length} missions to ${member.displayName || member.email}`);

      for (const missionTemplate of dailyMissions) {
        missions.push({
          userId: member.id,
          tripId: trip.id,
          missionTemplateId: missionTemplate.id,
          dayAssigned: 1,
          createdAt: new Date()
        });
      }
    }

    // Bulk create first day missions
    await prisma.assignedMission.createMany({
      data: missions
    });

    console.log(`✅ Created ${missions.length} initial missions`);

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

  // ✅ FIXED: Assign daily missions (for already active trips)
  async assignDailyMissions() {
    try {
      const now = new Date();
      const activeTrips = await prisma.trip.findMany({
        where: {
          status: 'ACTIVE',
          endDate: {
            gte: now // Trip hasn't ended yet
          }
        },
        include: {
          members: true,
          tripAliases: true
        }
      });

      console.log(`📋 Found ${activeTrips.length} active trips for daily mission assignment`);

      for (const trip of activeTrips) {
        await this.checkDailyMissionAssignment(trip);
      }
    } catch (error) {
      console.error('Error assigning daily missions:', error);
    }
  }

  // ✅ FIXED: Check if daily missions need to be assigned for a trip
  async checkDailyMissionAssignment(trip) {
    try {
      const tripStartDate = new Date(trip.startDate);
      const now = new Date();
      
      // Calculate days since trip started (1-indexed)
      const daysSinceStart = Math.floor((now - tripStartDate) / (1000 * 60 * 60 * 24)) + 1;
      
      // Don't assign missions for days before the trip or after it should end
      if (daysSinceStart < 1) {
        console.log(`⏳ Trip "${trip.name}" hasn't started yet`);
        return;
      }

      const distribution = this.calculateMissionDistribution(trip);
      
      // Calculate expected missions per user based on days elapsed
      const expectedMissionsPerUser = Math.min(
        daysSinceStart * distribution.missionsPerUserPerDay,
        distribution.missionsPerUser // Cap at total missions per user
      );

      console.log(`📊 Trip "${trip.name}" - Day ${daysSinceStart}: Expected ${expectedMissionsPerUser} missions per user`);

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
          console.log(`🎯 User ${member.displayName || member.email} needs ${missionsNeeded} more missions`);
          await this.assignAdditionalMissions(trip, member, missionsNeeded, daysSinceStart);
        } else {
          console.log(`✅ User ${member.displayName || member.email} has enough missions (${currentMissionCount}/${expectedMissionsPerUser})`);
        }
      }
    } catch (error) {
      console.error(`Error checking daily missions for trip ${trip.id}:`, error);
    }
  }

  // ✅ FIXED: Assign additional missions with proper template relationship
  async assignAdditionalMissions(trip, member, count, dayNumber) {
    try {
      const missionTemplates = await this.getMissionTemplates(trip.theme, trip.tripMode);
      const selectedMissions = this.selectMissionsForUser(missionTemplates, count, trip.tripMode);

      const missions = selectedMissions.map(missionTemplate => ({
        userId: member.id,
        tripId: trip.id,
        missionTemplateId: missionTemplate.id, // ✅ PROPER TEMPLATE REFERENCE
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

      console.log(`✅ Assigned ${count} missions to ${member.displayName || member.email} for day ${dayNumber}`);
    } catch (error) {
      console.error(`Error assigning missions to ${member.id}:`, error);
    }
  }

  // ✅ FIXED: Check for trips that should end
  async checkTripsToEnd() {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      const tripsToEnd = await prisma.trip.findMany({
        where: {
          status: 'ACTIVE',
          endDate: {
            lt: today // End date is before today
          }
        }
      });

      console.log(`🏁 Found ${tripsToEnd.length} trips that should end`);

      for (const trip of tripsToEnd) {
        await this.endTrip(trip);
      }
    } catch (error) {
      console.error('Error checking trips to end:', error);
    }
  }

  // End a trip
  async endTrip(trip) {
    try {
      await prisma.trip.update({
        where: { id: trip.id },
        data: { status: 'COMPLETED' }
      });

      console.log(`🏁 Trip "${trip.name}" has been completed`);
      
      // Generate album could be triggered here
      // await albumService.generateAlbum(trip.id);
       try {
      await albumService.generateTripAlbum(trip.id);
    } catch (albumError) {
      console.error(`⚠️ Failed to generate album for trip ${trip.id}:`, albumError);
    }
    } catch (error) {
      console.error(`Error ending trip ${trip.id}:`, error);
    }
  }

  // ✅ NEW: Manual method to check and fix any trips that might have been missed
  async manualTripCheck() {
    try {
      console.log('🔧 Running manual trip status check...');
      await this.checkAndActivateTrips();
      await this.assignDailyMissions();
      await this.checkTripsToEnd();
      console.log('✅ Manual trip check completed');
    } catch (error) {
      console.error('Error in manual trip check:', error);
    }
  }

  // ✅ NEW: Immediate mission assignment for newly created active trips
  async assignMissionsToActiveTrip(trip) {
    try {
      console.log(`🚀 Assigning missions immediately to active trip: ${trip.name} (ID: ${trip.id})`);

      // Get trip with members and aliases for proper mission distribution
      const tripWithMembers = await prisma.trip.findUnique({
        where: { id: trip.id },
        include: {
          members: true,
          tripAliases: true
        }
      });

      if (!tripWithMembers) {
        throw new Error(`Trip ${trip.id} not found`);
      }

      // Calculate mission distribution according to DEV FILE algorithm
      const missionDistribution = this.calculateMissionDistribution(tripWithMembers);
      
      console.log(`📊 Mission distribution for "${trip.name}":`, {
        participants: missionDistribution.participantCount,
        duration: missionDistribution.durationDays,
        targetPhotos: missionDistribution.targetPhotos,
        missionsPerUser: missionDistribution.missionsPerUser,
        missionsPerUserPerDay: missionDistribution.missionsPerUserPerDay,
        totalMissions: missionDistribution.totalMissions
      });
      
      // Get mission templates based on trip theme
      const missionTemplates = await this.getMissionTemplates(trip.theme, trip.tripMode);
      console.log(`🎯 Found ${missionTemplates.length} mission templates for theme: ${trip.theme}, mode: ${trip.tripMode}`);
      
      // Assign first day missions to all members
      await this.assignInitialMissions(tripWithMembers, missionTemplates, missionDistribution);
      
      // Update trip total missions count
      await prisma.trip.update({
        where: { id: trip.id },
        data: { 
          totalMissions: missionDistribution.totalMissions
        }
      });

      // Send activation notifications
      await notificationService.sendTripActivationNotification({
        tripId: trip.id,
        tripName: trip.name
      });

      console.log(`✅ Missions assigned immediately for trip "${trip.name}" with ${missionDistribution.totalMissions} total missions planned`);
    } catch (error) {
      console.error(`❌ Error assigning missions to active trip ${trip.id}:`, error);
      throw error; // Re-throw to handle in calling function
    }
  }
}

module.exports = new MissionSchedulerService();