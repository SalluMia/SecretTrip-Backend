// src/services/home.service.js - SIMPLIFIED VERSION (Active + Upcoming Only)

const { prisma } = require('../config/prisma');

// ✅ HELPER: Format mission data
const formatMissionData = (mission) => ({
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
  
  // Mission Template Data
  missionTemplateId: mission.missionTemplateId,
  title: mission.missionTemplate?.title || mission.title,
  instruction: mission.missionTemplate?.instruction || mission.instruction,
  category: mission.missionTemplate?.category || mission.category,
  sampleImageUrl: mission.missionTemplate?.sampleImageUrl || mission.sampleImageUrl,
  level: mission.missionTemplate?.level || 'NORMAL',
  location: mission.missionTemplate?.location,
  
  missionTemplate: mission.missionTemplate
});

exports.getHomeData = async (userId) => {
  let activeTripData = null;
  let activeMissions = [];
  let userAlias = null;

  // ✅ Get ACTIVE trip (created OR joined)
  const activeTrip = await prisma.trip.findFirst({
    where: {
      OR: [
        { members: { some: { id: userId } } }, // Joined trip
        { creatorId: userId }                  // Created trip
      ],
      status: 'ACTIVE'
    },
    include: {
      members: {
        select: {
          id: true,
          displayName: true,
          profilePhotoUrl: true
        }
      },
      creator: {
        select: {
          id: true,
          displayName: true,
          profilePhotoUrl: true
        }
      }
    }
  });

  if (activeTrip) {
    // Get user's alias (only for joined trips, not created ones)
    const alias = await prisma.tripAlias.findUnique({
      where: {
        tripId_userId: {
          tripId: activeTrip.id,
          userId
        }
      }
    });

    // ✅ Get ALL missions for this user in active trip (NO filtering by completed status)
    activeMissions = await prisma.assignedMission.findMany({
      where: {
        tripId: activeTrip.id,
        userId: userId
        // ✅ REMOVED: completed filter - ab sab missions milein gi
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

    const isCreator = activeTrip.creatorId === userId;

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
      memberCount: activeTrip.members.length,
      creator: activeTrip.creator,
      creatorId: activeTrip.creatorId,
      isCreator: isCreator,
      userRole: isCreator ? 'CREATOR' : 'MEMBER'
    };

    userAlias = isCreator ? null : alias?.alias;
  }

  // ✅ Get UPCOMING trips (created OR joined)
  const upcomingTrips = await prisma.trip.findMany({
    where: {
      OR: [
        { members: { some: { id: userId } } }, // Joined trips
        { creatorId: userId }                  // Created trips
      ],
      status: 'UPCOMING'
    },
    include: {
      members: {
        select: {
          id: true,
          displayName: true,
          profilePhotoUrl: true
        }
      },
      creator: {
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
      const isCreator = trip.creatorId === userId;
      
      // Get alias only for joined trips
      let tripAlias = null;
      if (!isCreator) {
        tripAlias = await prisma.tripAlias.findUnique({
          where: {
            tripId_userId: {
              tripId: trip.id,
              userId
            }
          }
        });
      }

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
        memberCount: trip.members.length,
        creator: trip.creator,
        creatorId: trip.creatorId,
        isCreator: isCreator,
        userRole: isCreator ? 'CREATOR' : 'MEMBER'
      };
    })
  );

  return {
    // ✅ Active Trip with ALL missions
    activeTrip: activeTripData,
    alias: userAlias,
    activeMissions: activeMissions.map(formatMissionData),

    // ✅ Upcoming Trips (created + joined)
    upcomingTrips: formattedUpcomingTrips,
    
    // ✅ Simple summary
    summary: {
      hasActiveTrip: !!activeTripData,
      totalMissionsCount: activeMissions.length,
      upcomingTripsCount: formattedUpcomingTrips.length,
      createdUpcomingTrips: formattedUpcomingTrips.filter(trip => trip.isCreator).length,
      joinedUpcomingTrips: formattedUpcomingTrips.filter(trip => !trip.isCreator).length
    }
  };
};