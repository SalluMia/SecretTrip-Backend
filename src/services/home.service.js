// src/services/home.service.js - Simplified version: Active trip + missions & Upcoming trips only

const { prisma } = require('../config/prisma');

exports.getHomeData = async (userId) => {
  let activeTripData = null;
  let activeMissions = [];
  let userAlias = null;

  // Get active trip
  const activeTrip = await prisma.trip.findFirst({
    where: {
      members: { some: { id: userId } },
      status: 'ACTIVE'
    },
    include: {
      members: {
        select: {
          id: true,
          displayName: true,
          profilePhotoUrl: true
        }
      }
    }
  });

  if (activeTrip) {
    // Get user's alias for this trip
    const alias = await prisma.tripAlias.findUnique({
      where: {
        tripId_userId: {
          tripId: activeTrip.id,
          userId
        }
      }
    });

    // Get active missions WITH mission template relationship
    activeMissions = await prisma.assignedMission.findMany({
      where: {
        tripId: activeTrip.id,
        userId: userId,
        completed: false
      },
      include: {
        missionTemplate: {
          select: {
            id: true,
            title: true,
            instruction: true,
            category: true,
            level: true,
            location: true,
            sampleImageUrl: true,
            isActive: true
          }
        }
      },
      orderBy: [
        { dayAssigned: 'asc' },
        { createdAt: 'asc' }
      ]
    });

    // Calculate current day of trip
    const tripStartDate = new Date(activeTrip.startDate);
    const now = new Date();
    const currentDay = Math.floor((now - tripStartDate) / (1000 * 60 * 60 * 24)) + 1;

    activeTripData = {
      id: activeTrip.id,
      title: activeTrip.name,
      theme: activeTrip.theme,
      tripMode: activeTrip.tripMode,
      startDate: activeTrip.startDate,
      endDate: activeTrip.endDate,
      status: activeTrip.status,
      currentDay: currentDay > 0 ? currentDay : 1,
      members: activeTrip.members,
      memberCount: activeTrip.members.length
    };

    userAlias = alias?.alias;
  }

  // Get upcoming trips
  const upcomingTrips = await prisma.trip.findMany({
    where: {
      members: { some: { id: userId } },
      status: 'UPCOMING'
    },
    include: {
      members: {
        select: {
          id: true,
          displayName: true,
          profilePhotoUrl: true
        }
      }
    },
    orderBy: { startDate: 'asc' }
  });

  // Format upcoming trips
  const formattedUpcomingTrips = await Promise.all(
    upcomingTrips.map(async (trip) => {
      // Get user's alias for this trip
      const tripAlias = await prisma.tripAlias.findUnique({
        where: {
          tripId_userId: {
            tripId: trip.id,
            userId
          }
        }
      });

      // Calculate days until trip starts
      const daysUntilStart = Math.ceil((new Date(trip.startDate) - new Date()) / (1000 * 60 * 60 * 24));

      return {
        id: trip.id,
        title: trip.name,
        theme: trip.theme,
        tripMode: trip.tripMode,
        startDate: trip.startDate,
        endDate: trip.endDate,
        status: trip.status,
        daysUntilStart,
        alias: tripAlias?.alias || null,
        members: trip.members,
        memberCount: trip.members.length
      };
    })
  );

  return {
    // Active Trip Section
    activeTrip: activeTripData,
    alias: userAlias,
    
    // Active missions with mission template information
    activeMissions: activeMissions.map(mission => ({
      // Assigned Mission Data
      id: mission.id,
      userId: mission.userId,
      tripId: mission.tripId,
      completed: mission.completed,
      photoUrl: mission.photoUrl,
      thumbnailUrl: mission.thumbnailUrl,
      caption: mission.caption,
      dayAssigned: mission.dayAssigned,
      createdAt: mission.createdAt,
      submittedAt: mission.submittedAt,
      
      // Mission Template Data (priority given to template, fallback to assigned mission fields)
      missionTemplateId: mission.missionTemplateId,
      title: mission.missionTemplate?.title || mission.title,
      instruction: mission.missionTemplate?.instruction || mission.instruction,
      category: mission.missionTemplate?.category || mission.category,
      sampleImageUrl: mission.missionTemplate?.sampleImageUrl || mission.sampleImageUrl,
      level: mission.missionTemplate?.level || 'NORMAL',
      location: mission.missionTemplate?.location,
      
      // Complete Mission Template Object (if available)
      missionTemplate: mission.missionTemplate
    })),

    // Upcoming Trips Section
    upcomingTrips: formattedUpcomingTrips
  };
};