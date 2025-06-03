const { prisma } = require('../config/prisma');

exports.getHomeData = async (userId) => {
  const activeTrip = await prisma.trip.findFirst({
    where: {
      members: { some: { id: userId } },
      status: 'ACTIVE'
    }
  });

  if (!activeTrip) return { activeTrip: null, todayMissions: [], alias: null };

  const alias = await prisma.tripAlias.findUnique({
    where: {
      tripId_userId: {
        tripId: activeTrip.id,
        userId
      }
    }
  });

const todayMissions = await prisma.assignedMission.findMany({
  where: {
    tripId: activeTrip.id,
    userId,
    completed: false
  },
  orderBy: { title: 'asc' } // ✅ replace this
});


  const now = new Date();
  const start = new Date(activeTrip.startDate);
  const currentDay = Math.floor((now - start) / (1000 * 60 * 60 * 24)) + 1;

  return {
    activeTrip: {
      id: activeTrip.id,
      name: activeTrip.name,
      theme: activeTrip.theme,
      startDate: activeTrip.startDate,
      endDate: activeTrip.endDate,
      currentDay
    },
    alias: alias?.alias,
    todayMissions: todayMissions.map(m => ({
      id: m.id,
      title: m.title,
      instruction: m.instruction,
      submitted: !!m.photoUrl,
      critical: Math.random() < 0.3 // for demo
    }))
  };
};
