// 🚀 Secret Trip Full Functional Implementation (Trips + Missions)
// Enhanced with direct join and notifications

const { prisma } = require('../config/prisma');
const { generateCode } = require('../utils/generateCode');
const { shuffleArray, tripDurationDays } = require('../utils/helpers');

exports.createTrip = async ({ userId, name, theme,location, startDate, endDate, alias, tripMode = 'normal', description }) => {
  const code = generateCode(6);
  const trip = await prisma.trip.create({
    data: {
      name,
      theme,
      location,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status: 'UPCOMING',
      code,
      creatorId: userId,
      tripMode,
      description,
      members: { connect: { id: userId } },
    }
  });

  await prisma.tripAlias.create({
    data: { userId, tripId: trip.id, alias }
  });

  return { tripId: trip.id, code: trip.code };
};

// Enhanced trip preview with detailed information
exports.getTripByCodeWithDetails = async ({ code, userId }) => {
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
          profilePhotoUrl: true,
          email:true,
        }
      },
      tripAliases: {
        select: {
          alias: true,
          userId: true,
          user: {
            select: {
              displayName: true,
              profilePhotoUrl: true
            }
          }
        }
      }
    }
  });

  if (!trip) {
    throw new Error('Trip not found with this code');
  }

  // Check if user is already a member
  const isAlreadyMember = trip.members.some(member => member.id === userId);
  
  // Get members with their aliases
  const membersWithAliases = trip.members.map(member => {
    const aliasInfo = trip.tripAliases.find(ta => ta.userId === member.id);
    return {
      id: member.id,
      displayName: member.displayName,
      profilePhotoUrl: member.profilePhotoUrl,
      alias: aliasInfo?.alias || null,
      isCreator: member.id === trip.creatorId
    };
  });

  // Get taken aliases for validation
  const takenAliases = trip.tripAliases.map(ta => ta.alias);

  return {
    id: trip.id,
    name: trip.name,
    description: trip.description,
    theme: trip.theme,
    location: trip.location,
    startDate: trip.startDate,
    endDate: trip.endDate,
    status: trip.status,
    tripMode: trip.tripMode,
    creator: trip.creator,
    memberCount: trip.members.length,
    members: membersWithAliases,
    takenAliases,
    isAlreadyMember,
    canJoin: !isAlreadyMember && trip.status === 'UPCOMING',
    joinMessage: isAlreadyMember 
      ? 'You are already a member of this trip'
      : trip.status !== 'UPCOMING'
      ? 'This trip is no longer accepting new members'
      : 'You can join this trip'
  };
};

// Direct join trip without approval process
exports.joinTripDirectly = async ({ userId, alias, code }) => {
  const trip = await prisma.trip.findUnique({
    where: { code },
    include: {
      members: true,
      tripAliases: true
    }
  });

  if (!trip) {
    throw new Error('Trip not found');
  }
  
  // if (trip.status !== 'UPCOMING') {
  //   throw new Error('Cannot join trip that has already started or ended');
  // }

  // Check if already a member
  const isAlreadyMember = trip.members.some(member => member.id === userId);
  if (isAlreadyMember) {
    throw new Error('You are already a member of this trip');
  }

  // Check if alias is taken
  const aliasTaken = trip.tripAliases.some(ta => ta.alias.toLowerCase() === alias.toLowerCase());
  if (aliasTaken) {
    throw new Error('This alias is already taken for this trip');
  }

  // ✅ NEW: Check for date conflicts with user's existing trips
  await validateTripDateConflicts(userId, trip.startDate, trip.endDate, trip.name);

  // Add user to trip members
  await prisma.trip.update({
    where: { id: trip.id },
    data: {
      members: {
        connect: { id: userId }
      }
    }
  });

  // Create trip alias
  await prisma.tripAlias.create({
    data: {
      tripId: trip.id,
      userId,
      alias
    }
  });

  return {
    tripId: trip.id,
    tripName: trip.name,
    alias,
    message: `Successfully joined "${trip.name}" as ${alias}`,
    memberCount: trip.members.length + 1
  };
};

// ✅ UPDATED: Allow sequential trips without strict "after all trips" rule
const validateTripDateConflicts = async (userId, newTripStartDate, newTripEndDate, newTripName) => {
  const userTrips = await prisma.trip.findMany({
    where: {
      members: {
        some: { id: userId }
      },
      status: {
        in: ['ACTIVE', 'UPCOMING']
      }
    },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      status: true
    },
    orderBy: {
      startDate: 'asc'
    }
  });

  if (userTrips.length === 0) {
    return true; // No existing trips, can join
  }

  const newStart = new Date(newTripStartDate);
  const newEnd = new Date(newTripEndDate);

  // Rule 1: Check for ANY date overlap with existing trips (this is the main rule)
  const conflictingTrips = userTrips.filter(existingTrip => {
    const existingStart = new Date(existingTrip.startDate);
    const existingEnd = new Date(existingTrip.endDate);

    // Check if dates overlap (including same dates or overlapping dates)
    const hasOverlap = (newStart <= existingEnd) && (newEnd >= existingStart);
    
    return hasOverlap;
  });

  if (conflictingTrips.length > 0) {
    const conflictDetails = conflictingTrips.map(trip => {
      const startDate = new Date(trip.startDate).toLocaleDateString();
      const endDate = new Date(trip.endDate).toLocaleDateString();
      const status = trip.status === 'ACTIVE' ? 'Active' : 'Upcoming';
      return `"${trip.name}" (${status}: ${startDate} - ${endDate})`;
    }).join(', ');

    throw new Error(
      `Cannot join "${newTripName}" because its dates overlap with your existing trip(s): ${conflictDetails}. ` +
      `Please choose dates that don't conflict with your current trips.`
    );
  }

  // Rule 2: Find the best insertion point for the new trip
  const sortedTrips = [...userTrips].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  
  // Check if new trip can fit between existing trips or after all trips
  let canInsert = false;
  let suggestedSlots = [];

  // Check if it can go before the first trip
  if (sortedTrips.length > 0) {
    const firstTripStart = new Date(sortedTrips[0].startDate);
    if (newEnd < firstTripStart) {
      canInsert = true;
    }
  }

  // Check if it can fit between trips
  for (let i = 0; i < sortedTrips.length - 1; i++) {
    const currentTripEnd = new Date(sortedTrips[i].endDate);
    const nextTripStart = new Date(sortedTrips[i + 1].startDate);
    
    if (newStart > currentTripEnd && newEnd < nextTripStart) {
      canInsert = true;
      break;
    }
    
    // Calculate available slots for suggestions
    const slotStart = new Date(currentTripEnd);
    slotStart.setDate(slotStart.getDate() + 1);
    const slotEnd = new Date(nextTripStart);
    slotEnd.setDate(slotEnd.getDate() - 1);
    
    if (slotStart < slotEnd) {
      suggestedSlots.push(`${slotStart.toLocaleDateString()} to ${slotEnd.toLocaleDateString()}`);
    }
  }

  // Check if it can go after the last trip
  if (sortedTrips.length > 0) {
    const lastTripEnd = new Date(sortedTrips[sortedTrips.length - 1].endDate);
    if (newStart > lastTripEnd) {
      canInsert = true;
    }
    
    // Add slot after last trip
    const afterLastTrip = new Date(lastTripEnd);
    afterLastTrip.setDate(afterLastTrip.getDate() + 1);
    suggestedSlots.push(`${afterLastTrip.toLocaleDateString()} onwards`);
  }

  if (!canInsert) {
    let suggestionMessage = '';
    if (suggestedSlots.length > 0) {
      suggestionMessage = ` Available time slots: ${suggestedSlots.join(', ')}.`;
    }
    
    throw new Error(
      `The trip "${newTripName}" cannot be scheduled during the requested dates. ` +
      `Please choose dates that don't overlap with your existing trips.${suggestionMessage}`
    );
  }

  return true; // All validations passed - trip can be inserted
};

// Helper function to check user's trip status
const checkUserTripStatus = async (userId) => {
  const userTrips = await prisma.trip.findMany({
    where: {
      members: {
        some: { id: userId }
      },
      status: {
        in: ['ACTIVE', 'UPCOMING']
      }
    },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      status: true
    },
    orderBy: {
      startDate: 'asc'
    }
  });

  const activeTrip = userTrips.find(trip => trip.status === 'ACTIVE');
  const upcomingTrips = userTrips.filter(trip => trip.status === 'UPCOMING');

  let nextAvailableDate = new Date();
  if (userTrips.length > 0) {
    const latestEndDate = Math.max(...userTrips.map(trip => new Date(trip.endDate).getTime()));
    nextAvailableDate = new Date(latestEndDate);
    nextAvailableDate.setDate(nextAvailableDate.getDate() + 1);
  }

  return {
    hasActiveTrip: !!activeTrip,
    activeTrip,
    upcomingTripsCount: upcomingTrips.length,
    upcomingTrips,
    nextAvailableDate,
    canJoinNewTrip: true // Will be determined by validation
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
  // First, verify user is a member of this trip
  const trip = await prisma.trip.findFirst({
    where: {
      id: tripId,
      members: {
        some: { id: userId }
      }
    },
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true
    }
  });

  if (!trip) {
    throw new Error('Trip not found or you are not a member of this trip');
  }

  // Get user's alias for this trip
  const userAlias = await prisma.tripAlias.findUnique({
    where: {
      tripId_userId: {
        tripId,
        userId
      }
    },
    select: {
      alias: true
    }
  });

  // Get all missions for this user in this trip using ONLY available fields
  const allMissions = await prisma.assignedMission.findMany({
    where: { 
      tripId, 
      userId 
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      userId: true,
      tripId: true,
      title: true,
      instruction: true,
      category: true,
      sampleImageUrl: true,
      photoUrl: true,
      completed: true, // BOOLEAN NOT NULL DEFAULT false
      submittedAt: true, // TIMESTAMP
      createdAt: true, // TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      caption: true, // TEXT
      dayAssigned: true, // INTEGER
      thumbnailUrl: true // TEXT
    }
  });

  // Separate missions using explicit boolean comparison
  const completedMissions = allMissions.filter(mission => mission.completed === true);
  const pendingMissions = allMissions.filter(mission => mission.completed === false);
  
  console.log(`📊 Mission breakdown for user ${userId}:`);
  console.log(`   Total missions: ${allMissions.length}`);
  console.log(`   Completed (true): ${completedMissions.length}`);
  console.log(`   Pending (false): ${pendingMissions.length}`);
  
  // Get the next mission (first pending mission where completed is false)
  const nextMission = pendingMissions.length > 0 ? pendingMissions[0] : null;

  // Calculate mission statistics
  const totalMissions = allMissions.length;
  const completedCount = completedMissions.length;
  const pendingCount = pendingMissions.length;
  const completionPercentage = totalMissions > 0 ? Math.round((completedCount / totalMissions) * 100) : 0;

  // Format missions with available fields only
  const formatMission = (mission) => ({
    id: mission.id,
    title: mission.title,
    instruction: mission.instruction,
    category: mission.category,
    completed: mission.completed, // Boolean true/false
    submitted: !!mission.photoUrl || !!mission.submittedAt,
    photoUrl: mission.photoUrl,
    thumbnailUrl: mission.thumbnailUrl,
    sampleImageUrl: mission.sampleImageUrl,
    caption: mission.caption,
    dayAssigned: mission.dayAssigned,
    createdAt: mission.createdAt,
    submittedAt: mission.submittedAt,
    daysSinceCreated: mission.createdAt ? 
      Math.floor((new Date() - new Date(mission.createdAt)) / (1000 * 60 * 60 * 24)) : null
  });

  // Format completed missions (only those with completed === true)
  const formattedCompletedMissions = completedMissions.map(mission => {
    const formatted = {
      ...formatMission(mission),
      // Calculate days since submission if available
      daysSinceSubmitted: mission.submittedAt ? 
        Math.floor((new Date() - new Date(mission.submittedAt)) / (1000 * 60 * 60 * 24)) : null
    };
    
    // Log completed mission validation
    console.log(`✅ Completed mission: "${mission.title}" - completed: ${mission.completed} (${typeof mission.completed})`);
    
    return formatted;
  });

  // Log next mission details
  if (nextMission) {
    console.log(`🎯 Next mission: "${nextMission.title}" - completed: ${nextMission.completed} (${typeof nextMission.completed})`);
  } else {
    console.log(`🎉 No pending missions - all completed!`);
  }

  return {
    trip: {
      id: trip.id,
      name: trip.name,
      status: trip.status,
      startDate: trip.startDate,
      endDate: trip.endDate
    },
    userAlias: userAlias?.alias || null,
    missionSummary: {
      total: totalMissions,
      completed: completedCount,
      pending: pendingCount,
      completionPercentage
    },
    nextMission: nextMission ? {
      ...formatMission(nextMission),
      isNext: true,
      priority: 'high'
    } : null,
    completedMissions: formattedCompletedMissions
  };
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
// src/services/trip.service.js
exports.getTripsByStatus = async ({ userId, status }) => {
  const mappedStatus = {
    upcoming: 'UPCOMING',
    active: 'ACTIVE',
    completed: 'COMPLETED'
  }[status.toLowerCase()];

  if (!mappedStatus) {
    throw new Error('Invalid trip status');
  }

  const trips = await prisma.trip.findMany({
    where: {
      status: mappedStatus, // ✅ Now a valid Prisma enum value
      members: {
        some: { id: userId }
      }
    },
    include: {
      tripAliases: {
        where: { userId },
        select: { alias: true }
      },
      assignedMissions: {
        where: { userId },
        select: { completed: true }
      },
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
          email: true,
          profilePhotoUrl: true
        }
      }
    },
    orderBy: {
      startDate: 'desc'
    }
  });

  return trips.map(trip => {
    const totalMissions = trip.assignedMissions.length;
    const completedMissions = trip.assignedMissions.filter(m => m.completed).length;

    const membersWithAliases = trip.members.map(member => {
      const aliasInfo = trip.tripAliases.find(ta => ta.userId === member.id);
      return {
        id: member.id,
        displayName: member.displayName,
        email: member.email,
        profilePhotoUrl: member.profilePhotoUrl,
        alias: aliasInfo?.alias || null,
        isCreator: member.id === trip.creator.id
      };
    });

    return {
      id: trip.id,
      name: trip.name,
      theme: trip.theme,
      description: trip.description,
      startDate: trip.startDate,
      endDate: trip.endDate,
      status: trip.status,
      tripMode: trip.tripMode,
       code: trip.code,
      creator: trip.creator,
      memberCount: trip.members.length,
      members: membersWithAliases,
      alias: trip.tripAliases[0]?.alias || null,
      progress: {
        completed: completedMissions,
        total: totalMissions
      }
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