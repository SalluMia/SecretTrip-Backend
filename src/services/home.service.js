const { prisma } = require('../config/prisma');

exports.getHomeData = async (userId) => {
  // Get active trip with its missions
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

  let activeTripData = null;
  let userAlias = null;
  let activeMissions = [];

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

    // Get all active missions for this trip (not just today's)
    activeMissions = await prisma.assignedMission.findMany({
      where: {
        tripId: activeTrip.id,
        userId,
        completed: false
      },
      orderBy: { createdAt: 'asc' }
    });

    // Calculate current day
    const now = new Date();
    const start = new Date(activeTrip.startDate);
    const currentDay = Math.floor((now - start) / (1000 * 60 * 60 * 24)) + 1;

    activeTripData = {
      id: activeTrip.id,
      name: activeTrip.name,
      theme: activeTrip.theme,
      startDate: activeTrip.startDate,
      endDate: activeTrip.endDate,
      currentDay: currentDay > 0 ? currentDay : 1,
      members: activeTrip.members,
      memberCount: activeTrip.members.length
    };

    userAlias = alias?.alias;
  }

  // Get upcoming trips (trips that user is member of but haven't started yet)
  const upcomingTrips = await prisma.trip.findMany({
  where: {
    members: { some: { id: userId } },
    status: 'UPCOMING',
    // startDate: {
    //   gte: new Date(new Date().toDateString()) // Include today's date
    // }
  },
  include: {
    members: {
      select: {
        id: true,
        displayName: true,
        profilePhotoUrl: true
      }
    },
    _count: {
      select: {
        assignedMissions: true
      }
    }
  },
  orderBy: { startDate: 'asc' }
});


  // Format upcoming trips with complete information
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
        startDate: trip.startDate,
        endDate: trip.endDate,
        daysUntilStart,
        alias: tripAlias?.alias || null,
        members: trip.members,
        memberCount: trip.members.length,
        totalMissions: trip._count.assignedMissions,
        type: 'UPCOMING',
        duration: Math.ceil((new Date(trip.endDate) - new Date(trip.startDate)) / (1000 * 60 * 60 * 24))
      };
    })
  );

  return {
    // Active Trip Section (displayed at top)
    activeTrip: activeTripData,
    alias: userAlias,
    activeMissions: activeMissions.map(m => ({
      id: m.id,
      title: m.title,
      instruction: m.instruction,
      submitted: !!m.photoUrl,
      critical: Math.random() < 0.3, // You can replace this with actual logic
      createdAt: m.createdAt
    })),
    
    // Upcoming Trips Section (instead of today's missions)
    upcomingTrips: formattedUpcomingTrips
  };
};