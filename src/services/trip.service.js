const { prisma } = require('../config/prisma');
const { generateCode } = require('../utils/generateCode');

exports.createTrip = async ({ userId, name, theme, startDate, endDate }) => {
  const code = generateCode(6);

  const trip = await prisma.trip.create({
    data: {
      name,
      theme,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status: 'planned',
      code,
      creatorId: userId,
      members: {
        connect: { id: userId }
      }
    }
  });

  return { tripId: trip.id, code: trip.code };
};

exports.requestJoinTrip = async ({ userId, alias, code }) => {
  const trip = await prisma.trip.findUnique({ where: { code } });
  if (!trip) throw new Error('Trip not found');

  const aliasExists = await prisma.joinRequest.findFirst({
    where: { tripId: trip.id, alias }
  });
  if (aliasExists) throw new Error('Alias already taken in this trip');

  const existingRequest = await prisma.joinRequest.findUnique({
    where: {
      tripId_userId: {
        tripId: trip.id,
        userId
      }
    }
  });
  if (existingRequest) throw new Error('You already requested to join this trip');

  const joinRequest = await prisma.joinRequest.create({
    data: {
      tripId: trip.id,
      userId,
      alias
    }
  });

  return joinRequest;
};

exports.getPendingRequests = async ({ tripId, creatorId }) => {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip || trip.creatorId !== creatorId) {
    throw new Error('Unauthorized or trip not found');
  }

  return prisma.joinRequest.findMany({
    where: {
      tripId,
      status: 'pending'
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          displayName: true
        }
      }
    }
  });
};

exports.respondToRequest = async ({ tripId, userId, action, creatorId }) => {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip || trip.creatorId !== creatorId) {
    throw new Error('Unauthorized');
  }

  const request = await prisma.joinRequest.findUnique({
    where: {
      tripId_userId: {
        tripId,
        userId
      }
    }
  });

  if (!request) throw new Error('Join request not found');

  // On approval, add user to trip members
  if (action === 'approve') {
    await prisma.trip.update({
      where: { id: tripId },
      data: {
        members: {
          connect: { id: userId }
        }
      }
    });
  }

  return prisma.joinRequest.update({
    where: {
      tripId_userId: {
        tripId,
        userId
      }
    },
    data: {
      status: action
    }
  });
};

exports.getMyTrips = async (userId) => {
  const created = await prisma.trip.findMany({
    where: {
      creatorId: userId
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  const joined = await prisma.trip.findMany({
    where: {
      members: {
        some: { id: userId }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  return { created, joined };
};
