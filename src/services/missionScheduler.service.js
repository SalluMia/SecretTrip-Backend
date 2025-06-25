const { prisma } = require('../config/prisma');
const { shuffleArray, tripDurationDays } = require('../utils/helpers');
const notificationService = require('./notification.service');
const albumService = require('./album.service');
const cron = require('node-cron');

// 🕒 Start cron scheduler
exports.startScheduler = () => {
  cron.schedule('0 * * * *', async () => {
    console.log('🕒 Checking for trips to activate...');
    await exports.checkAndActivateTrips();
  });

  cron.schedule('0 6 * * *', async () => {
    console.log('🎯 Assigning daily missions...');
    await exports.assignDailyMissions();
  });
};

// 🚀 Check and activate upcoming trips
exports.checkAndActivateTrips = async () => {
  try {
    const now = new Date();
    const trips = await prisma.trip.findMany({
      where: { status: 'UPCOMING', startDate: { lte: now } },
      include: { members: true, tripAliases: true }
    });

    for (const trip of trips) {
      await exports.activateTripAndAssignMissions(trip);
    }
  } catch (err) {
    console.error('Error checking trips:', err);
  }
};

// 🧠 Trip mission distribution logic
function calculateMissionDistribution(trip) {
  const N = trip.members.length;
  const D = tripDurationDays(trip.startDate, trip.endDate);
  const X = (N * D < 40) ? 100 : 80;
  const M = Math.ceil(X / N);
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

// 📋 Fetch mission templates
async function getMissionTemplates(theme, tripMode) {
  const where = { isActive: true };

  if (tripMode === 'fun') {
    where.category = { in: ['AESTHETIC', 'SECRET_AGENT'] };
  } else {
    where.category = 'AESTHETIC';
  }

  const templates = await prisma.missionTemplate.findMany({
    where,
    orderBy: { createdAt: 'desc' }
  });

  if (!templates.length) {
    throw new Error(`No mission templates found`);
  }

  return templates;
}

// 🎯 Assign missions to all members
async function assignMissionsToMembers(trip, templates, dist) {
  const missions = [];

  for (const member of trip.members) {
    const userMissions = selectMissionsForUser(templates, dist.missionsPerUser, trip.tripMode);

    for (let i = 0; i < userMissions.length; i++) {
      const m = userMissions[i];
      const day = Math.floor(i / dist.missionsPerUserPerDay) + 1;

      missions.push({
        userId: member.id,
        tripId: trip.id,
        title: m.title,
        instruction: m.instruction,
        category: m.category,
        sampleImageUrl: m.sampleImageUrl,
        dayAssigned: day,
        createdAt: new Date()
      });
    }
  }

  await prisma.assignedMission.createMany({ data: missions });

  for (const member of trip.members) {
    const alias = trip.tripAliases.find(a => a.userId === member.id)?.alias || 'Agent';
    await notificationService.sendMissionAssignedNotification({
      userId: member.id,
      missionTitle: `${dist.missionsPerUserPerDay} nouvelles missions`,
      tripName: trip.name,
      alias
    });
  }
}

// 🎲 Mission selection
function selectMissionsForUser(templates, count, mode) {
  let selected = [];
  const aesthetic = templates.filter(t => t.category === 'AESTHETIC');
  const secret = templates.filter(t => t.category === 'SECRET_AGENT');

  if (mode === 'fun') {
    for (let i = 0; i < count; i++) {
      const isSecret = Math.random() < (2 / 7);
      const pool = isSecret && secret.length ? secret : aesthetic;
      const rand = Math.floor(Math.random() * pool.length);
      selected.push(pool[rand]);
    }
  } else {
    selected = shuffleArray(templates).slice(0, count);
  }

  while (selected.length < count) {
    const random = templates[Math.floor(Math.random() * templates.length)];
    selected.push(random);
  }

  return selected;
}

// ✅ Activate a single trip
exports.activateTripAndAssignMissions = async (trip) => {
  try {
    console.log(`🚀 Activating trip: ${trip.name}`);
    const dist = calculateMissionDistribution(trip);
    const templates = await getMissionTemplates(trip.theme, trip.tripMode);

    await assignMissionsToMembers(trip, templates, dist);

    await prisma.trip.update({
      where: { id: trip.id },
      data: {
        status: 'ACTIVE',
        totalMissions: dist.totalMissions
      }
    });

    await notificationService.sendTripActivationNotification({
      tripId: trip.id,
      tripName: trip.name
    });

    console.log(`✅ Trip "${trip.name}" activated`);
  } catch (err) {
    console.error('Trip activation error:', err);
  }
};

// 🔁 Assign daily missions
exports.assignDailyMissions = async () => {
  try {
    const activeTrips = await prisma.trip.findMany({
      where: { status: 'ACTIVE', endDate: { gte: new Date() } },
      include: { members: true, tripAliases: true }
    });

    for (const trip of activeTrips) {
      await exports.checkDailyMissionAssignment(trip);
    }
  } catch (err) {
    console.error('Daily mission error:', err);
  }
};

// 📅 Check daily mission for each member
exports.checkDailyMissionAssignment = async (trip) => {
  try {
    const start = new Date(trip.startDate);
    const now = new Date();
    const days = Math.floor((now - start) / (1000 * 60 * 60 * 24)) + 1;
    const dist = calculateMissionDistribution(trip);
    const expected = Math.min(days * dist.missionsPerUserPerDay, dist.missionsPerUser);

    for (const member of trip.members) {
      const count = await prisma.assignedMission.count({
        where: { userId: member.id, tripId: trip.id }
      });

      if (count < expected) {
        const toAssign = expected - count;
        await exports.assignAdditionalMissions(trip, member, toAssign);
      }
    }
  } catch (err) {
    console.error('Error checking daily mission:', err);
  }
};

// ➕ Assign extra missions
exports.assignAdditionalMissions = async (trip, member, count) => {
  try {
    const templates = await getMissionTemplates(trip.theme, trip.tripMode);
    const selected = selectMissionsForUser(templates, count, trip.tripMode);

    const missions = selected.map(m => ({
      userId: member.id,
      tripId: trip.id,
      title: m.title,
      instruction: m.instruction,
      category: m.category,
      sampleImageUrl: m.sampleImageUrl,
      createdAt: new Date()
    }));

    await prisma.assignedMission.createMany({ data: missions });

    const alias = trip.tripAliases.find(a => a.userId === member.id)?.alias || 'Agent';
    await notificationService.sendMissionAssignedNotification({
      userId: member.id,
      missionTitle: `${count} nouvelle${count > 1 ? 's' : ''} mission${count > 1 ? 's' : ''}`,
      tripName: trip.name,
      alias
    });

    console.log(`📋 Assigned ${count} missions to ${member.displayName}`);
  } catch (err) {
    console.error('Error assigning extra missions:', err);
  }
};

// 👇 Manually trigger activation
exports.manuallyActivateTrip = async (tripId, creatorId) => {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { members: true, tripAliases: true }
  });

  if (!trip || trip.creatorId !== creatorId) {
    throw new Error('Unauthorized or not found');
  }

  if (trip.status !== 'UPCOMING') {
    throw new Error('Trip is not upcoming');
  }

  await exports.activateTripAndAssignMissions(trip);
  return trip;
};

// 📅 End completed trips
exports.checkTripsToEnd = async () => {
  try {
    const now = new Date();
    const trips = await prisma.trip.findMany({
      where: { status: 'ACTIVE', endDate: { lt: now } }
    });

    for (const trip of trips) {
      await exports.endTrip(trip);
    }
  } catch (err) {
    console.error('Error checking trips to end:', err);
  }
};

// ✅ Finalize trip and generate album
exports.endTrip = async (trip) => {
  try {
    console.log(`🏁 Ending trip: ${trip.name}`);

    await prisma.trip.update({
      where: { id: trip.id },
      data: { status: 'COMPLETED' }
    });

    const completed = await prisma.assignedMission.count({
      where: { tripId: trip.id, completed: true }
    });

    await prisma.trip.update({
      where: { id: trip.id },
      data: { completedMissions: completed }
    });

    await albumService.generateTripAlbum(trip.id);

    console.log(`✅ Trip "${trip.name}" completed`);
  } catch (err) {
    console.error(`Error ending trip: ${trip.id}`, err);
  }
};
