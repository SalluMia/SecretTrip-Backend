// 🚀 Secret Trip Full Functional Implementation (Trips + Missions)
// Prisma schema is already up-to-date (TripAlias, tripMode, etc.)

const { prisma } = require('../config/prisma');
const { generateCode } = require('../utils/generateCode');
const { shuffleArray, tripDurationDays } = require('../utils/helpers');

exports.createTrip = async ({ userId, name, theme, startDate, endDate, alias, tripMode = 'normal' }) => {
  const code = generateCode(6);
  const trip = await prisma.trip.create({
    data: {
      name,
      theme,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status: 'UPCOMING',
      code,
      creatorId: userId,
      tripMode,
      members: { connect: { id: userId } },
    }
  });

  await prisma.tripAlias.create({
    data: { userId, tripId: trip.id, alias }
  });

  return { tripId: trip.id, code: trip.code };
};

exports.requestJoinTrip = async ({ userId, alias, code }) => {
  const trip = await prisma.trip.findUnique({ where: { code } });
  if (!trip) throw new Error('Trip not found');

  const aliasTaken = await prisma.tripAlias.findFirst({
    where: { tripId: trip.id, alias }
  });
  if (aliasTaken) throw new Error('Alias already taken');

  const alreadyRequested = await prisma.joinRequest.findUnique({
    where: { tripId_userId: { tripId: trip.id, userId } }
  });
  if (alreadyRequested) throw new Error('Already requested');

  return await prisma.joinRequest.create({
    data: { tripId: trip.id, userId, alias }
  });
};

exports.respondToRequest = async ({ tripId, userId, action, creatorId }) => {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip || trip.creatorId !== creatorId) throw new Error('Unauthorized');

  if (action === 'approve') {
    await prisma.trip.update({
      where: { id: tripId },
      data: { members: { connect: { id: userId } } }
    });

    const alias = await prisma.joinRequest.findUnique({
      where: { tripId_userId: { tripId, userId } }
    });

    await prisma.tripAlias.upsert({
  where: {
    tripId_userId: {
      tripId,
      userId
    }
  },
  update: {
    alias: alias.alias
  },
  create: {
    tripId,
    userId,
    alias: alias.alias
  }
});

  }

  return await prisma.joinRequest.update({
    where: { tripId_userId: { tripId, userId } },
    data: { status: action }
  });
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

exports.activateTrip = async ({ tripId, creatorId }) => {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { members: true }
  });
  if (!trip || trip.creatorId !== creatorId) throw new Error('Unauthorized');

  const days = tripDurationDays(trip.startDate, trip.endDate);
  const N = trip.members.length;
  const target = (N * days < 40) ? 100 : 80;
  const M = Math.ceil(target / N);
  const m = Math.ceil(M / days);

  const allTemplates = await prisma.missionTemplate.findMany({
    where: { category: trip.theme }
  });

  for (const member of trip.members) {
    const selected = shuffleArray(allTemplates).slice(0, M);
    for (const tmpl of selected) {
      await prisma.assignedMission.create({
        data: {
          tripId,
          userId: member.id,
          title: tmpl.title,
          instruction: tmpl.instruction,
          category: tmpl.category,
          sampleImageUrl: tmpl.sampleImageUrl
        }
      });
    }
  }

  return await prisma.trip.update({
    where: { id: tripId },
    data: { status: 'ACTIVE' }
  });
};

exports.getMyMissions = async ({ tripId, userId }) => {
  return await prisma.assignedMission.findMany({
    where: { tripId, userId },
    orderBy: { createdAt: 'asc' }
  });
};

exports.swapMission = async ({ missionId, userId }) => {
  const mission = await prisma.assignedMission.findUnique({ where: { id: missionId } });
  if (!mission || mission.userId !== userId || mission.completed) {
    throw new Error('Cannot swap this mission');
  }

  const others = await prisma.missionTemplate.findMany({
    where: {
      category: mission.category,
      NOT: { title: mission.title }
    }
  });

  const newOne = others[Math.floor(Math.random() * others.length)];

  return await prisma.assignedMission.update({
    where: { id: missionId },
    data: {
      title: newOne.title,
      instruction: newOne.instruction,
      sampleImageUrl: newOne.sampleImageUrl
    }
  });
};

exports.submitMissionPhoto = async ({ missionId, userId, photoUrl }) => {
  const mission = await prisma.assignedMission.findUnique({ where: { id: missionId } });
  if (!mission || mission.userId !== userId || mission.completed) {
    throw new Error('Invalid or already completed');
  }

  return await prisma.assignedMission.update({
    where: { id: missionId },
    data: {
      photoUrl,
      completed: true,
      submittedAt: new Date()
    }
  });
};


// ✅ Get filtered trips by status (upcoming, active, completed)
exports.getTripsByStatus = async ({ userId, status }) => {
  const mappedStatus = {
    upcoming: 'UPCOMING',
    active: 'ACTIVE',
    completed: 'COMPLETED'
  }[status];

  const trips = await prisma.trip.findMany({
    where: {
      status: mappedStatus,
      members: { some: { id: userId } }
    },
    include: {
      tripAliases: {
        where: { userId },
        select: { alias: true }
      },
      assignedMissions: {
        where: { userId },
        select: { completed: true }
      }
    },
    orderBy: { startDate: 'desc' }
  });

  return trips.map(trip => {
    const totalMissions = trip.assignedMissions.length;
    const completedMissions = trip.assignedMissions.filter(m => m.completed).length;
    return {
      id: trip.id,
      name: trip.name,
      startDate: trip.startDate,
      endDate: trip.endDate,
      theme: trip.theme,
      alias: trip.tripAliases[0]?.alias || null,
      progress: { completed: completedMissions, total: totalMissions }
    };
  });
};

// ✅ Get detailed trip info
exports.getTripDetails = async ({ userId, tripId }) => {
  const trip = await prisma.trip.findFirst({
    where: {
      id: tripId,
      members: { some: { id: userId } }
    },
    include: {
      tripAliases: true,
      members: {
        select: {
          id: true,
          displayName: true,
          profilePhotoUrl: true,
          createdTrips: { select: { id: true } }
        }
      }
    }
  });

  if (!trip) throw new Error('Trip not found');

  const alias = trip.tripAliases.find(t => t.userId === userId)?.alias;

  return {
    id: trip.id,
    name: trip.name,
    description: trip.description || '',
    theme: trip.theme,
    startDate: trip.startDate,
    endDate: trip.endDate,
    alias,
    members: trip.members.map(m => ({
      id: m.id,
      displayName: m.displayName,
      profilePhotoUrl: m.profilePhotoUrl,
      isCreator: m.createdTrips.some(t => t.id === tripId)
    }))
  };
};

// ✅ Get completed trip album preview
exports.getTripAlbumPreview = async ({ userId, tripId }) => {
  const trip = await prisma.trip.findFirst({
    where: {
      id: tripId,
      members: { some: { id: userId } },
      status: 'COMPLETED'
    },
    include: {
      album: true,
      assignedMissions: {
        where: {
          userId,
          completed: true
        },
        select: { photoUrl: true }
      }
    }
  });

  if (!trip || !trip.album) throw new Error('No album available yet');

  return {
    tripName: trip.name,
    photoCount: trip.assignedMissions.length,
    pdfUrl: trip.album.pdfUrl,
    pdfHDUrl: trip.album.pdfHDUrl,
    photos: trip.assignedMissions.map(m => m.photoUrl)
  };
};

// Get trip details by code (for preview before joining)
exports.getTripByCode = async ({ code, userId }) => {
  const trip = await prisma.trip.findUnique({
    where: { code },
    include: {
      creator: {
        select: {
          id: true,
          displayName: true,
          profilePhotoUrl: true
        }
      },
      members: {
        select: {
          id: true,
          displayName: true,
          profilePhotoUrl: true
        }
      },
      tripAliases: {
        select: {
          alias: true,
          userId: true,
          user: {
            select: {
              displayName: true
            }
          }
        }
      },
      joinRequests: {
        where: {
          status: 'pending'
        },
        select: {
          userId: true,
          alias: true
        }
      }
    }
  });

  if (!trip) {
    throw new Error('Trip not found with this code');
  }

  // Check if user is already a member
  const isAlreadyMember = trip.members.some(member => member.id === userId);
  
  // Check if user already has a pending request
  const hasPendingRequest = trip.joinRequests.some(request => request.userId === userId);

  // Get taken aliases
  const takenAliases = trip.tripAliases.map(ta => ta.alias);

  return {
    id: trip.id,
    name: trip.name,
    theme: trip.theme,
    startDate: trip.startDate,
    endDate: trip.endDate,
    status: trip.status,
    creator: trip.creator,
    memberCount: trip.members.length,
    members: trip.members,
    takenAliases,
    isAlreadyMember,
    hasPendingRequest,
    canJoin: !isAlreadyMember && !hasPendingRequest && trip.status === 'UPCOMING'
  };
};

// Enhanced join request with better validation
exports.requestJoinTripEnhanced = async ({ userId, alias, code }) => {
  const trip = await prisma.trip.findUnique({
    where: { code },
    include: {
      members: true,
      tripAliases: true,
      joinRequests: {
        where: { status: 'pending' }
      }
    }
  });

  if (!trip) throw new Error('Trip not found');
  
  if (trip.status !== 'UPCOMING') {
    throw new Error('Cannot join trip that has already started or ended');
  }

  // Check if already a member
  const isAlreadyMember = trip.members.some(member => member.id === userId);
  if (isAlreadyMember) throw new Error('You are already a member of this trip');

  // Check if already has pending request
  const hasPendingRequest = trip.joinRequests.some(request => request.userId === userId);
  if (hasPendingRequest) throw new Error('You already have a pending request for this trip');

  // Check if alias is taken
  const aliasTaken = trip.tripAliases.some(ta => ta.alias.toLowerCase() === alias.toLowerCase());
  if (aliasTaken) throw new Error('This alias is already taken for this trip');

  // Check if alias is in pending requests
  const aliasInPending = trip.joinRequests.some(req => req.alias.toLowerCase() === alias.toLowerCase());
  if (aliasInPending) throw new Error('This alias is already requested by another user');

  const joinRequest = await prisma.joinRequest.create({
    data: {
      tripId: trip.id,
      userId,
      alias,
      status: 'pending'
    },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          profilePhotoUrl: true,
          email: true
        }
      },
      trip: {
        select: {
          name: true,
          creator: {
            select: {
              id: true,
              displayName: true
            }
          }
        }
      }
    }
  });

  // Send notification to trip creator
  // (We'll implement this in the notification service)
  
  return {
    requestId: joinRequest.id,
    message: 'Join request sent successfully',
    tripName: trip.name,
    alias: joinRequest.alias
  };
};

// Enhanced respond to request with notifications
exports.respondToRequestEnhanced = async ({ tripId, userId, action, creatorId }) => {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      creator: true
    }
  });
  
  if (!trip || trip.creatorId !== creatorId) {
    throw new Error('Unauthorized or trip not found');
  }

  const joinRequest = await prisma.joinRequest.findUnique({
    where: { tripId_userId: { tripId, userId } },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          email: true,
          profilePhotoUrl: true
        }
      }
    }
  });

  if (!joinRequest) {
    throw new Error('Join request not found');
  }

  if (joinRequest.status !== 'pending') {
    throw new Error('This request has already been processed');
  }

  // Update join request status
  const updatedRequest = await prisma.joinRequest.update({
    where: { tripId_userId: { tripId, userId } },
    data: { status: action === 'approve' ? 'approved' : 'rejected' }
  });

  if (action === 'approve') {
    // Add user to trip members
    await prisma.trip.update({
      where: { id: tripId },
      data: {
        members: {
          connect: { id: userId }
        }
      }
    });

    // Create trip alias
    await prisma.tripAlias.create({
      data: {
        tripId,
        userId,
        alias: joinRequest.alias
      }
    });
  }

  // Send notification to user
  // (We'll implement this in the notification service)

  return {
    action,
    user: joinRequest.user,
    tripName: trip.name,
    alias: joinRequest.alias,
    message: `Request ${action === 'approve' ? 'approved' : 'rejected'} successfully`
  };
};

// Get trip members with aliases
exports.getTripMembers = async ({ tripId, userId }) => {
  // Check if user is member or creator of the trip
  const trip = await prisma.trip.findFirst({
    where: {
      id: tripId,
      OR: [
        { creatorId: userId },
        { members: { some: { id: userId } } }
      ]
    },
    include: {
      members: {
        select: {
          id: true,
          displayName: true,
          profilePhotoUrl: true
        }
      },
      tripAliases: {
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              profilePhotoUrl: true
            }
          }
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

  if (!trip) {
    throw new Error('Trip not found or access denied');
  }

  const membersWithAliases = trip.members.map(member => {
    const alias = trip.tripAliases.find(ta => ta.userId === member.id);
    return {
      ...member,
      alias: alias?.alias || null,
      isCreator: member.id === trip.creatorId
    };
  });

  return {
    tripId: trip.id,
    tripName: trip.name,
    creator: trip.creator,
    members: membersWithAliases,
    totalMembers: membersWithAliases.length
  };
};