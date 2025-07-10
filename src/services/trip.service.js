// 🚀 Secret Trip Full Functional Implementation (Trips + Missions)
// Enhanced with direct join and notifications

const { prisma } = require('../config/prisma');
const { generateCode } = require('../utils/generateCode');
const { shuffleArray, tripDurationDays } = require('../utils/helpers');

exports.createTrip = async ({ userId, name, theme, location, startDate, endDate, alias, tripMode = 'normal', description }) => {
  const code = generateCode(6);
  const parsedStartDate = new Date(startDate);
  const parsedEndDate = new Date(endDate);

  // ✅ FIXED: Pass the trip name parameter to the validation function
  await validateTripDateConflicts(userId, parsedStartDate, parsedEndDate, name);
  
  // ✅ NEW: Determine trip status based on start date
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Reset time to start of day for accurate comparison
  
  const startDateOnly = new Date(parsedStartDate);
  startDateOnly.setHours(0, 0, 0, 0);
  
  const endDateOnly = new Date(parsedEndDate);
  endDateOnly.setHours(0, 0, 0, 0);
  
  let tripStatus = 'UPCOMING';
  
  // Check if trip should be active or completed based on dates
  if (startDateOnly <= today && endDateOnly >= today) {
    tripStatus = 'ACTIVE';
  } else if (endDateOnly < today) {
    throw new Error('Cannot create a trip with end date in the past');
  }
  
  console.log(`🗓️ Trip "${name}" dates: ${startDateOnly.toDateString()} to ${endDateOnly.toDateString()}`);
  console.log(`📅 Today: ${today.toDateString()}`);
  console.log(`🎯 Trip status will be: ${tripStatus}`);
  
  const trip = await prisma.trip.create({
    data: {
      name,
      theme,
      location,
      startDate: parsedStartDate,
      endDate: parsedEndDate,
      status: tripStatus,
      code,
      creatorId: userId,
      tripMode,
      description,
      alias,
      members: { connect: { id: userId } },
    }
  });

  await prisma.tripAlias.create({
    data: { userId, tripId: trip.id, alias }
  });

  // ✅ NEW: If trip is active, automatically assign missions
  if (tripStatus === 'ACTIVE') {
    console.log(`🚀 Trip "${name}" is starting today, auto-assigning missions...`);
    
    try {
      const days = tripDurationDays(trip.startDate, trip.endDate);
      const N = 1; // Only creator initially
      const target = (N * days < 40) ? 100 : 80;
      const M = Math.ceil(target / N);

      const allTemplates = await prisma.missionTemplate.findMany({
        where: { category: trip.theme }
      });

      if (allTemplates.length > 0) {
        const selected = shuffleArray(allTemplates).slice(0, M);
        for (const tmpl of selected) {
          await prisma.assignedMission.create({
            data: {
              tripId: trip.id,
              userId: userId,
              title: tmpl.title,
              instruction: tmpl.instruction,
              category: tmpl.category,
              sampleImageUrl: tmpl.sampleImageUrl,
              missionTemplateId: tmpl.id
            }
          });
        }
        console.log(`✅ Assigned ${selected.length} missions to trip creator`);
      }
    } catch (missionError) {
      console.error('Failed to assign missions during trip creation:', missionError);
      // Don't fail trip creation if mission assignment fails
    }
  }

  return { 
    tripId: trip.id, 
    code: trip.code, 
    status: tripStatus,
    isActive: tripStatus === 'ACTIVE',
    message: tripStatus === 'ACTIVE' 
      ? `Trip "${name}" created and activated! Missions have been assigned.`
      : `Trip "${name}" created successfully and scheduled to start on ${startDateOnly.toDateString()}.`
  };
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
      some: {
        id: userId
      }
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

  // ✅ FIXED: Get all missions WITH mission template information
  const allMissions = await prisma.assignedMission.findMany({
    where: { 
      tripId, 
      userId 
    },
    include: {
      missionTemplate: true // ✅ INCLUDE TEMPLATE RELATION
    },
    orderBy: { createdAt: 'asc' }
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

  // ✅ FIXED: Format missions with BOTH assigned mission data AND template data
  const formatMission = (mission) => ({
    // Assigned Mission Data
    id: mission.id,
    completed: mission.completed,
    photoUrl: mission.photoUrl,
    thumbnailUrl: mission.thumbnailUrl,
    caption: mission.caption,
    dayAssigned: mission.dayAssigned,
    createdAt: mission.createdAt,
    submittedAt: mission.submittedAt,
    
    // Mission Template Data (priority given to template if available)
    missionTemplateId: mission.missionTemplateId,
    title: mission.missionTemplate?.title || mission.title,
    instruction: mission.missionTemplate?.instruction || mission.instruction,
    category: mission.missionTemplate?.category || mission.category,
    sampleImageUrl: mission.missionTemplate?.sampleImageUrl || mission.sampleImageUrl,
    level: mission.missionTemplate?.level,
    location: mission.missionTemplate?.location,
    isActive: mission.missionTemplate?.isActive,
    
    // Computed fields
    submitted: !!mission.photoUrl || !!mission.submittedAt,
    daysSinceCreated: mission.createdAt ? 
      Math.floor((new Date() - new Date(mission.createdAt)) / (1000 * 60 * 60 * 24)) : null,
    
    // Full template data for reference
    missionTemplate: mission.missionTemplate
  });

  // Format completed missions
  const formattedCompletedMissions = completedMissions.map(mission => {
    const formatted = {
      ...formatMission(mission),
      daysSinceSubmitted: mission.submittedAt ? 
        Math.floor((new Date() - new Date(mission.submittedAt)) / (1000 * 60 * 60 * 24)) : null
    };
    
    console.log(`✅ Completed mission: "${mission.missionTemplate?.title || mission.title}" - Template ID: ${mission.missionTemplateId}`);
    return formatted;
  });

  // Log next mission details
  if (nextMission) {
    console.log(`🎯 Next mission: "${nextMission.missionTemplate?.title || nextMission.title}" - Template ID: ${nextMission.missionTemplateId}`);
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

// ✅ FIXED: Swap mission with proper template handling
exports.swapMission = async ({ missionId, userId }) => {
  const mission = await prisma.assignedMission.findUnique({ 
    where: { id: missionId },
    include: { missionTemplate: true }
  });
  
  if (!mission || mission.userId !== userId || mission.completed) {
    throw new Error('Cannot swap this mission');
  }

  // Get available templates of same category, excluding current one
  const availableTemplates = await prisma.missionTemplate.findMany({
    where: {
      category: mission.missionTemplate?.category || mission.category,
      isActive: true,
      NOT: { 
        id: mission.missionTemplateId 
      }
    }
  });

  if (availableTemplates.length === 0) {
    throw new Error('No alternative missions available for this category');
  }

  const newTemplate = availableTemplates[Math.floor(Math.random() * availableTemplates.length)];

  // ✅ Update with new template reference
  return await prisma.assignedMission.update({
    where: { id: missionId },
    data: {
      missionTemplateId: newTemplate.id, // ✅ UPDATE TEMPLATE REFERENCE
      title: newTemplate.title,
      instruction: newTemplate.instruction,
      category: newTemplate.category,
      sampleImageUrl: newTemplate.sampleImageUrl
    },
    include: {
      missionTemplate: true // ✅ RETURN WITH TEMPLATE DATA
    }
  });
};

// ✅ Submit mission photo (no changes needed, but included for completeness)
exports.submitMissionPhoto = async ({ missionId, userId, photoUrl, caption }) => {
  const mission = await prisma.assignedMission.findUnique({ 
    where: { id: missionId },
    include: { missionTemplate: true }
  });
  
  if (!mission || mission.userId !== userId || mission.completed) {
    throw new Error('Invalid or already completed mission');
  }

  return await prisma.assignedMission.update({
    where: { id: missionId },
    data: {
      photoUrl,
      caption: caption || null,
      completed: true,
      submittedAt: new Date()
    },
    include: {
      missionTemplate: true // ✅ RETURN WITH TEMPLATE DATA
    }
  });
};

// ✅ FIXED: Get all trip missions with template information
exports.getTripMissions = async ({ tripId, userId }) => {
  // Verify user access
  const trip = await prisma.trip.findFirst({
    where: {
      id: tripId,
      members: { some: { id: userId } }
    }
  });

  if (!trip) {
    throw new Error('Trip not found or access denied');
  }

  // Get all missions for the trip with template data
  const missions = await prisma.assignedMission.findMany({
    where: { tripId },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          profilePhotoUrl: true
        }
      },
      missionTemplate: true // ✅ INCLUDE TEMPLATE RELATION
    },
    orderBy: [
      { dayAssigned: 'asc' },
      { createdAt: 'asc' }
    ]
  });

  // Group missions by user
  const missionsByUser = missions.reduce((acc, mission) => {
    const userId = mission.userId;
    if (!acc[userId]) {
      acc[userId] = {
        user: mission.user,
        missions: []
      };
    }
    
    // ✅ Format with template data
    acc[userId].missions.push({
      id: mission.id,
      missionTemplateId: mission.missionTemplateId,
      title: mission.missionTemplate?.title || mission.title,
      instruction: mission.missionTemplate?.instruction || mission.instruction,
      category: mission.missionTemplate?.category || mission.category,
      level: mission.missionTemplate?.level,
      sampleImageUrl: mission.missionTemplate?.sampleImageUrl || mission.sampleImageUrl,
      photoUrl: mission.photoUrl,
      caption: mission.caption,
      completed: mission.completed,
      dayAssigned: mission.dayAssigned,
      submittedAt: mission.submittedAt,
      createdAt: mission.createdAt,
      missionTemplate: mission.missionTemplate // ✅ FULL TEMPLATE DATA
    });
    
    return acc;
  }, {});

  return {
    trip: {
      id: trip.id,
      name: trip.name,
      status: trip.status,
      startDate: trip.startDate,
      endDate: trip.endDate
    },
    missionsByUser,
    totalMissions: missions.length,
    completedMissions: missions.filter(m => m.completed).length
  };
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
      location:trip.location,
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
    location:trip.location,
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


exports.deleteTrip = async ({ tripId, userId }) => {
  // Step 1: Get trip with all necessary data
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      members: {
        select: {
          id: true,
          displayName: true,
          email: true
        }
      },
      creator: {
        select: {
          id: true,
          displayName: true
        }
      },
      assignedMissions: {
        select: { id: true }
      },
      tripAliases: {
        select: { id: true }
      },
      joinRequests: {
        select: { id: true }
      }
    }
  });

  // Step 2: Validation checks
  if (!trip) {
    throw new Error('Trip not found');
  }

  if (trip.creatorId !== userId) {
    throw new Error('Only trip creator can delete the trip');
  }

  // Step 3: Check if trip can be deleted (business logic)
  if (trip.status === 'ACTIVE') {
    throw new Error('Active trips cannot be deleted. Please complete or end the trip first');
  }

  if (trip.status === 'COMPLETED') {
    throw new Error('Completed trips cannot be deleted as they contain historical data');
  }

  // Only UPCOMING trips can be deleted
  if (trip.status !== 'UPCOMING') {
    throw new Error(`Trip with status "${trip.status}" cannot be deleted`);
  }

  // Step 4: Delete related data first (to avoid foreign key constraints)
  console.log(`🗑️ Deleting trip "${trip.name}" and all related data...`);

  // Delete in this order to handle foreign key relationships
  const deletionResults = await prisma.$transaction(async (tx) => {
    // 1. Delete assigned missions first
    const deletedMissions = await tx.assignedMission.deleteMany({
      where: { tripId }
    });

    // 2. Delete trip aliases
    const deletedAliases = await tx.tripAlias.deleteMany({
      where: { tripId }
    });

    // 3. Delete join requests
    const deletedJoinRequests = await tx.joinRequest.deleteMany({
      where: { tripId }
    });

    // 4. Delete any payments related to this trip
    const deletedPayments = await tx.payment.deleteMany({
      where: { tripId }
    });

    // 5. Delete album if exists
    const deletedAlbum = await tx.album.deleteMany({
      where: { tripId }
    });

    // 6. Finally delete the trip itself
    const deletedTrip = await tx.trip.delete({
      where: { id: tripId }
    });

    return {
      trip: deletedTrip,
      missions: deletedMissions.count,
      aliases: deletedAliases.count,
      joinRequests: deletedJoinRequests.count,
      payments: deletedPayments.count,
      albums: deletedAlbum.count
    };
  });

  console.log(`✅ Successfully deleted trip "${trip.name}"`);
  console.log(`📊 Deletion summary:`, {
    missions: deletionResults.missions,
    aliases: deletionResults.aliases,
    joinRequests: deletionResults.joinRequests,
    payments: deletionResults.payments,
    albums: deletionResults.albums,
    members: trip.members.length
  });

  // Step 5: Return success data
  return {
    tripId,
    tripName: trip.name,
    deletedAt: new Date().toISOString(),
    membersNotified: trip.members.length - 1, // Exclude creator
    deletionSummary: {
      missionsDeleted: deletionResults.missions,
      aliasesDeleted: deletionResults.aliases,
      joinRequestsDeleted: deletionResults.joinRequests,
      paymentsDeleted: deletionResults.payments,
      albumsDeleted: deletionResults.albums
    }
  };
};

// ✅ NEW: Edit trip function
exports.editTrip = async ({ tripId, userId, updateData }) => {
  // Step 1: Get existing trip with validation
  const existingTrip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      members: {
        select: {
          id: true,
          displayName: true
        }
      },
      creator: {
        select: {
          id: true,
          displayName: true
        }
      }
    }
  });

  // Step 2: Validation checks
  if (!existingTrip) {
    throw new Error('Trip not found');
  }

  if (existingTrip.creatorId !== userId) {
    throw new Error('Only trip creator can edit the trip');
  }

  // Step 3: Check if trip can be edited
  if (existingTrip.status === 'ACTIVE') {
    throw new Error('Active trips cannot be edited. Please complete the trip first');
  }

  if (existingTrip.status === 'COMPLETED') {
    throw new Error('Completed trips cannot be edited as they are historical records');
  }

  // Only UPCOMING trips can be edited
  if (existingTrip.status !== 'UPCOMING') {
    throw new Error(`Trip with status "${existingTrip.status}" cannot be edited`);
  }

  // Step 4: Prepare update data with validation
  const allowedFields = ['name', 'description', 'theme', 'location', 'startDate', 'endDate', 'tripMode'];
  const updateFields = {};

  // Filter and validate update fields
  for (const [key, value] of Object.entries(updateData)) {
    if (allowedFields.includes(key) && value !== undefined && value !== null) {
      if (key === 'startDate' || key === 'endDate') {
        updateFields[key] = new Date(value);
      } else if (key === 'name' || key === 'description') {
        // Trim strings
        updateFields[key] = value.toString().trim();
      } else {
        updateFields[key] = value;
      }
    }
  }

  // Check if there are any fields to update
  if (Object.keys(updateFields).length === 0) {
    throw new Error('No valid fields provided for update');
  }

  // Step 5: Validate date changes and conflicts
  if (updateFields.startDate || updateFields.endDate) {
    const newStartDate = updateFields.startDate || existingTrip.startDate;
    const newEndDate = updateFields.endDate || existingTrip.endDate;

    // Validate date logic
    if (newStartDate >= newEndDate) {
      throw new Error('Start date must be before end date');
    }

    // Check for conflicts with other trips (excluding current trip)
    await validateTripDateConflictsForEdit(userId, newStartDate, newEndDate, tripId);
  }

  // Step 6: Update the trip
  console.log(`📝 Updating trip "${existingTrip.name}" with fields:`, Object.keys(updateFields));

  const updatedTrip = await prisma.trip.update({
    where: { id: tripId },
    data: updateFields,
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
      },
      tripAliases: {
        select: {
          alias: true,
          userId: true
        }
      }
    }
  });

  console.log(`✅ Successfully updated trip "${updatedTrip.name}"`);

  // Step 7: Format response
  const isCreator = updatedTrip.creatorId === userId;
  const userAlias = updatedTrip.tripAliases.find(ta => ta.userId === userId)?.alias;

  return {
    id: updatedTrip.id,
    name: updatedTrip.name,
    description: updatedTrip.description,
    theme: updatedTrip.theme,
    location: updatedTrip.location,
    startDate: updatedTrip.startDate,
    endDate: updatedTrip.endDate,
    status: updatedTrip.status,
    tripMode: updatedTrip.tripMode,
    code: updatedTrip.code,
    creator: updatedTrip.creator,
    creatorId: updatedTrip.creatorId,
    members: updatedTrip.members,
    memberCount: updatedTrip.members.length,
    isCreator: isCreator,
    userRole: isCreator ? 'CREATOR' : 'MEMBER',
    alias: userAlias || null,
    updatedAt: updatedTrip.updatedAt,
    updatedFields: Object.keys(updateFields)
  };
};

// ✅ Helper function for edit date validation
const validateTripDateConflictsForEdit = async (userId, newStartDate, newEndDate, excludeTripId) => {
  const userTrips = await prisma.trip.findMany({
    where: {
      members: {
        some: { id: userId }
      },
      status: {
        in: ['ACTIVE', 'UPCOMING']
      },
      NOT: {
        id: excludeTripId // Exclude current trip being edited
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
    return true; // No other trips, no conflicts
  }

  const newStart = new Date(newStartDate);
  const newEnd = new Date(newEndDate);

  // Check for date overlap with existing trips
  const conflictingTrips = userTrips.filter(existingTrip => {
    const existingStart = new Date(existingTrip.startDate);
    const existingEnd = new Date(existingTrip.endDate);

    // Check if dates overlap
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
      `Cannot update trip dates because they would overlap with your existing trip(s): ${conflictDetails}. ` +
      `Please choose dates that don't conflict with your current trips.`
    );
  }

  return true;
};


// ✅ NEW: Leave trip function
exports.leaveTrip = async ({ tripId, userId, reason }) => {
  // Step 1: Get trip with user membership validation
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      members: {
        select: {
          id: true,
          displayName: true
        }
      },
      creator: {
        select: {
          id: true,
          displayName: true
        }
      },
      assignedMissions: {
        where: { userId },
        select: { id: true, completed: true }
      },
      tripAliases: {
        where: { userId },
        select: { id: true, alias: true }
      }
    }
  });

  // Step 2: Validation checks
  if (!trip) {
    throw new Error('Trip not found');
  }

  // Check if user is a member of this trip
  const isMember = trip.members.some(member => member.id === userId);
  if (!isMember) {
    throw new Error('You are not a member of this trip');
  }

  // Check if user is the creator (creators cannot leave their own trips)
  if (trip.creatorId === userId) {
    throw new Error('Trip creator cannot leave the trip. Please delete the trip instead');
  }

  // Step 3: Check if user can leave based on trip status
  if (trip.status === 'ACTIVE') {
    throw new Error('Cannot leave an active trip. Please wait for the trip to complete');
  }

  if (trip.status === 'COMPLETED') {
    throw new Error('Cannot leave a completed trip as it contains historical data');
  }

  // Only allow leaving UPCOMING trips
  if (trip.status !== 'UPCOMING') {
    throw new Error(`Cannot leave trip with status "${trip.status}"`);
  }

  // Step 4: Validate and sanitize reason
  const sanitizedReason = reason ? reason.toString().trim() : null;
  const finalReason = sanitizedReason && sanitizedReason.length > 0 ? sanitizedReason : 'No reason provided';

  // Limit reason length
  if (finalReason.length > 500) {
    throw new Error('Reason cannot exceed 500 characters');
  }

  // Step 5: Remove user from trip and clean up related data
  console.log(`🚪 User ${userId} is leaving trip "${trip.name}" with reason: "${finalReason}"`);

  const userAlias = trip.tripAliases[0]?.alias || 'Unknown';
  const userName = trip.members.find(m => m.id === userId)?.displayName || 'Unknown User';
  
  const leaveResults = await prisma.$transaction(async (tx) => {
    // 1. Create a leave record for audit/history purposes (optional - you can add this table to schema)
    // For now, we'll just log it

    // 2. Delete user's assigned missions for this trip
    const deletedMissions = await tx.assignedMission.deleteMany({
      where: { 
        tripId,
        userId 
      }
    });

    // 3. Delete user's trip alias
    const deletedAlias = await tx.tripAlias.deleteMany({
      where: { 
        tripId,
        userId 
      }
    });

    // 4. Delete any join requests from this user for this trip
    const deletedJoinRequests = await tx.joinRequest.deleteMany({
      where: { 
        tripId,
        userId 
      }
    });

    // 5. Remove user from trip members
    const updatedTrip = await tx.trip.update({
      where: { id: tripId },
      data: {
        members: {
          disconnect: { id: userId }
        }
      },
      include: {
        members: true
      }
    });

    return {
      trip: updatedTrip,
      missionsDeleted: deletedMissions.count,
      aliasDeleted: deletedAlias.count,
      joinRequestsDeleted: deletedJoinRequests.count
    };
  });

  // Step 6: Log leave activity with reason
  console.log(`✅ User "${userName}" (${userAlias}) successfully left trip "${trip.name}"`);
  console.log(`📝 Leave reason: "${finalReason}"`);
  console.log(`📊 Cleanup summary:`, {
    missionsDeleted: leaveResults.missionsDeleted,
    aliasDeleted: leaveResults.aliasDeleted,
    joinRequestsDeleted: leaveResults.joinRequestsDeleted,
    remainingMembers: leaveResults.trip.members.length
  });

  // Step 7: Return success data with reason
  return {
    tripId,
    tripName: trip.name,
    userName,
    userAlias,
    reason: finalReason,
    leftAt: new Date().toISOString(),
    remainingMemberCount: leaveResults.trip.members.length,
    cleanupSummary: {
      missionsDeleted: leaveResults.missionsDeleted,
      aliasDeleted: leaveResults.aliasDeleted,
      joinRequestsDeleted: leaveResults.joinRequestsDeleted
    },
    leaveActivity: {
      userId,
      userName,
      userAlias,
      tripId,
      tripName: trip.name,
      reason: finalReason,
      leftAt: new Date().toISOString(),
      tripStatus: trip.status
    }
  };
};

// ✅ NEW: Get completed missions for a user in a trip
exports.getTripCompletedMissions = async ({ tripId, userId }) => {
  // Step 1: Verify user access to the trip
  const trip = await prisma.trip.findFirst({
    where: {
      id: tripId,
      OR: [
        { members: { some: { id: userId } } }, // User is a member
        { creatorId: userId }                  // User is the creator
      ]
    },
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
      creatorId: true
    }
  });

  if (!trip) {
    throw new Error('Trip not found or you do not have access to this trip');
  }

  // Step 2: Get user's alias for this trip
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

  // Step 3: Get all completed missions for this user in this trip
  const completedMissions = await prisma.assignedMission.findMany({
    where: { 
      tripId, 
      userId,
      completed: true // Only completed missions
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
      { submittedAt: 'desc' }, // Most recently completed first
      { createdAt: 'asc' }     // Then by creation order
    ]
  });

  // Step 4: Format completed missions with rich data
  const formatCompletedMission = (mission) => ({
    // Mission identification
    id: mission.id,
    missionTemplateId: mission.missionTemplateId,
    
    // Completion data
    completed: mission.completed,
    submittedAt: mission.submittedAt,
    photoUrl: mission.photoUrl,
    thumbnailUrl: mission.thumbnailUrl,
    caption: mission.caption,
    
    // Mission details (prioritize template data)
    title: mission.missionTemplate?.title || mission.title,
    instruction: mission.missionTemplate?.instruction || mission.instruction,
    category: mission.missionTemplate?.category || mission.category,
    level: mission.missionTemplate?.level || 'NORMAL',
    location: mission.missionTemplate?.location,
    sampleImageUrl: mission.missionTemplate?.sampleImageUrl || mission.sampleImageUrl,
    
    // Timing information
    dayAssigned: mission.dayAssigned,
    createdAt: mission.createdAt,
    
    // Computed fields
    daysSinceSubmitted: mission.submittedAt ? 
      Math.floor((new Date() - new Date(mission.submittedAt)) / (1000 * 60 * 60 * 24)) : null,
    daysSinceCreated: mission.createdAt ? 
      Math.floor((new Date() - new Date(mission.createdAt)) / (1000 * 60 * 60 * 24)) : null,
    
    // Full template reference
    missionTemplate: mission.missionTemplate
  });

  const formattedCompletedMissions = completedMissions.map(formatCompletedMission);

  // Step 5: Calculate statistics
  const totalCompletedCount = completedMissions.length;
  
  // Get total missions count for completion percentage
  const totalMissionsCount = await prisma.assignedMission.count({
    where: { tripId, userId }
  });

  const completionPercentage = totalMissionsCount > 0 ? 
    Math.round((totalCompletedCount / totalMissionsCount) * 100) : 0;

  // Group by category for insights
  const missionsByCategory = formattedCompletedMissions.reduce((acc, mission) => {
    const category = mission.category || 'UNCATEGORIZED';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(mission);
    return acc;
  }, {});

  const isCreator = trip.creatorId === userId;

  console.log(`📊 Retrieved ${totalCompletedCount} completed missions for user ${userId} in trip "${trip.name}"`);

  return {
    trip: {
      id: trip.id,
      name: trip.name,
      status: trip.status,
      startDate: trip.startDate,
      endDate: trip.endDate
    },
    user: {
      userId,
      alias: userAlias?.alias || null,
      isCreator,
      userRole: isCreator ? 'CREATOR' : 'MEMBER'
    },
    completedMissions: formattedCompletedMissions,
    missionsByCategory,
    summary: {
      totalCompleted: totalCompletedCount,
      totalMissions: totalMissionsCount,
      completionPercentage,
      categoriesCompleted: Object.keys(missionsByCategory).length
    },
    metadata: {
      retrievedAt: new Date().toISOString(),
      hasMissions: totalCompletedCount > 0
    }
  };
};

exports.getUserCompletedMissionsHistory = async ({ userId }) => {
  const completedMissions = await prisma.assignedMission.findMany({
    where: {
      userId,
      completed: true
    },
    include: {
      trip: {
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          status: true,
          creatorId: true
        }
      },
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
      { submittedAt: 'desc' },
      { createdAt: 'asc' }
    ]
  });

  // Transform missions data
  const historyMissions = completedMissions.map(mission => ({
    id: mission.id,
    missionTemplateId: mission.missionTemplateId,
    completed: mission.completed,
    submittedAt: mission.submittedAt,
    photoUrl: mission.photoUrl,
    thumbnailUrl: mission.thumbnailUrl,
    caption: mission.caption,
    dayAssigned: mission.dayAssigned,
    createdAt: mission.createdAt,

    // Mission details (prefer template data)
    title: mission.missionTemplate?.title || mission.title,
    instruction: mission.missionTemplate?.instruction || mission.instruction,
    category: mission.missionTemplate?.category || mission.category,
    level: mission.missionTemplate?.level || 'NORMAL',
    location: mission.missionTemplate?.location,
    sampleImageUrl: mission.missionTemplate?.sampleImageUrl || mission.sampleImageUrl,

    // Trip details
    trip: mission.trip ? {
      id: mission.trip.id,
      name: mission.trip.name,
      startDate: mission.trip.startDate,
      endDate: mission.trip.endDate,
      status: mission.trip.status,
      creatorId: mission.trip.creatorId
    } : null
  }));

  // Return the desired structure
  return {
    historyMission: historyMissions,
    totalCount: historyMissions.length
  };
};

