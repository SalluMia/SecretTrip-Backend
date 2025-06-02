const { prisma } = require('../config/prisma');

exports.getAdminDashboardStats = async () => {
  const [
    activeUsers,
    blockedUsers,
    allTrips,
    completedTrips,
    activeTrips,
    upcomingTrips,
    allMissions,
    aestheticMissions,
    secretAgentMissions,
    users,
    trips,
    missionTemplates
  ] = await Promise.all([
    prisma.user.count({ where: { status: 'ACTIVE' } }),
    prisma.user.count({ where: { status: 'BLOCKED' } }),
    prisma.trip.count(),
    prisma.trip.count({ where: { status: 'COMPLETED' } }),
    prisma.trip.count({ where: { status: 'ACTIVE' } }),
    prisma.trip.count({ where: { status: 'UPCOMING' } }),
    prisma.assignedMission.count(),
    prisma.assignedMission.count({ where: { category: 'AESTHETIC' } }),
    prisma.assignedMission.count({ where: { category: 'SECRET_AGENT' } }),
    prisma.user.findMany({
      take: 3,
      select: {
        id: true,
        email: true,
        displayName: true,
        status: true
      }
    }),
    prisma.trip.findMany({
      take: 3,
      orderBy: { createdAt: 'desc' },
      include: {
        members: true
      }
    }),
    prisma.missionTemplate.findMany({
      take: 3
    })
  ]);

  return {
    overviewCards: {
      activeUsers,
      totalTrips: allTrips,
      totalMissions: allMissions,
      completedTrips
    },
    userStats: {
      active: activeUsers,
      blocked: blockedUsers
    },
    tripStats: {
      total: allTrips,
      active: activeTrips,
      upcoming: upcomingTrips,
      completed: completedTrips
    },
    missionStats: {
      total: allMissions,
      aesthetic: aestheticMissions,
      secretAgent: secretAgentMissions
    },
    recentUsers: users,
    recentTrips: trips.map(t => ({
      id: t.id,
      name: t.name,
      startDate: t.startDate,
      endDate: t.endDate,
      status: t.status,
      participants: t.members.length
    })),
    recentMissionTemplates: missionTemplates
  };
};



// ========================== Users Services ==========================


exports.getAllUsers = async (filters = {}) => {
  const { search, status } = filters;

  const where = {};

  // Add search filter on name or email (case-insensitive)
  if (search) {
    where.OR = [
      { displayName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } }
    ];
  }

  // Optional status filter
  if (status) {
    where.status = status.toUpperCase(); // e.g., ACTIVE or INACTIVE
  }

  return await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      displayName: true,
      email: true,
      status: true,
      profilePhotoUrl: true,
      createdAt: true
    }
  });
};


exports.toggleUserStatus = async (userId, action) => {
  const newStatus = action === 'block' ? 'BLOCKED' : 'ACTIVE';
  return await prisma.user.update({
    where: { id: userId },
    data: { status: newStatus },
    select: {
      id: true,
      email: true,
      displayName: true,
      status: true
    }
  });
};

exports.getUserById = async (userId) => {
  return await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      profilePhotoUrl: true,
      status: true,
      createdAt: true
    }
  });
};


// ============================Trips Servicses Function ===================================

exports.getAllTrips = async () => {
  const trips = await prisma.trip.findMany({
    orderBy: { startDate: 'desc' },
    include: {
      members: true,
      album: true
    }
  });

  return trips.map(trip => ({
    id: trip.id,
    name: trip.name,
    startDate: trip.startDate,
    endDate: trip.endDate,
    status: trip.status,
    hdVersion: trip.album?.pdfHDUrl ? 'paid' : 'not paid',
    participants: trip.members.length
  }));
};

exports.getFullTripDetail = async (tripId) => {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      creator: { select: { displayName: true } },
      members: true,
      album: true,
      assignedMissions: {
        include: {
          user: { select: { displayName: true } }
        },
        orderBy: { createdAt: 'asc' }
      }
    }
  });

  if (!trip) throw new Error('Trip not found');

  return {
    trip: {
      id: trip.id,
      name: trip.name,
      startDate: trip.startDate,
      endDate: trip.endDate,
      status: trip.status,
      participants: trip.members.length,
      createdBy: trip.creator.displayName
    },
    missions: trip.assignedMissions.map(m => ({
      id: m.id,
      title: m.title,
      instruction: m.instruction,
      category: m.category,
      photoUrl: m.photoUrl,
      completed: m.completed,
      submittedAt: m.submittedAt,
      assignedTo: m.user.displayName
    })),
    album: {
      photoCount: trip.assignedMissions.filter(m => m.completed).length,
      albumHD: trip.album?.pdfHDUrl || null,
      albumSD: trip.album?.pdfUrl || null,
      photos: trip.assignedMissions.filter(m => m.completed).map(m => m.photoUrl)
    }
  };
};


// ============================Packages Servicses Function ===================================
// Create a new package
exports.createPackage = async ({ name, price, features }) => {
  return await prisma.package.create({
    data: {
      name,
      price,
      features,
      status: 'ACTIVE'
    }
  });
};

exports.getAllPackages = async () => {
  return await prisma.package.findMany({
    orderBy: { createdAt: 'desc' }
  });
};

exports.updatePackage = async (id, { name, price, features }) => {
  return await prisma.package.update({
    where: { id },
    data: { name, price, features }
  });
};

exports.deletePackage = async (id) => {
  return await prisma.package.delete({ where: { id } });
};

exports.togglePackageStatus = async (id, action) => {
  const existing = await prisma.package.findUnique({ where: { id } });
  if (!existing) throw new Error('Package not found');

  return await prisma.package.update({
    where: { id },
    data: { status: action }
  });
};


// ============== MISSION FUNCTIONS ==============

exports.createMissionTemplate = async ({ title, instruction, category, type, level }) => {
  return await prisma.missionTemplate.create({
    data: {
      title,
      instruction,
      category,
      type,
      level
    }
  });
};

exports.getAllMissionTemplates = async (filters = {}) => {
  const { type, level, search } = filters;
  
  const where = {};
  
  // Filter by type (AESTHETIC or SECRET_AGENT)
  if (type && ['AESTHETIC', 'SECRET_AGENT'].includes(type)) {
    where.type = type;
  }
  
  // Filter by level (NORMAL or CRITICAL)
  if (level && ['NORMAL', 'CRITICAL'].includes(level)) {
    where.level = level;
  }
  
  // Search in title or instruction
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { instruction: { contains: search, mode: 'insensitive' } }
    ];
  }
  
  return await prisma.missionTemplate.findMany({
    where,
    orderBy: { id: 'desc' }
  });
};

exports.getMissionTemplateById = async (id) => {
  return await prisma.missionTemplate.findUnique({
    where: { id }
  });
};

exports.updateMissionTemplate = async (id, { title, instruction, category, type, level }) => {
  const existing = await prisma.missionTemplate.findUnique({ where: { id } });
  if (!existing) throw new Error('Mission template not found');
  
  return await prisma.missionTemplate.update({
    where: { id },
    data: {
      title,
      instruction,
      category,
      type,
      level
    }
  });
};

exports.deleteMissionTemplate = async (id) => {
  const existing = await prisma.missionTemplate.findUnique({ where: { id } });
  if (!existing) throw new Error('Mission template not found');
  
  return await prisma.missionTemplate.delete({
    where: { id }
  });
};


// ============== PRIVACY POLICY SERVICE FUNCTIONS ==============

exports.createPrivacyPolicy = async ({ language, content, version }) => {
  // Check if privacy policy already exists
  const existing = await prisma.privacyPolicy.findFirst();
  
  if (existing) {
    throw new Error('Privacy policy already exists. Use update instead.');
  }
  
  return await prisma.privacyPolicy.create({
    data: {
      language,
      content,
      version: version || '1.0',
      isActive: true
    }
  });
};

exports.getPrivacyPolicy = async () => {
  return await prisma.privacyPolicy.findFirst({
    where: { isActive: true }
  });
};

exports.updatePrivacyPolicy = async ({ language, content, version, isActive }) => {
  const existing = await prisma.privacyPolicy.findFirst();
  
  if (!existing) {
    throw new Error('Privacy policy not found');
  }
  
  // Auto-increment version if content is being updated
  let newVersion = existing.version;
  if (content && content !== existing.content) {
    const versionNumber = parseFloat(existing.version) + 0.1;
    newVersion = version || versionNumber.toFixed(1);
  }
  
  return await prisma.privacyPolicy.update({
    where: { id: existing.id },
    data: {
      language: language || existing.language,
      content: content || existing.content,
      version: newVersion,
      isActive: isActive !== undefined ? isActive : existing.isActive
    }
  });
};

exports.deletePrivacyPolicy = async () => {
  const existing = await prisma.privacyPolicy.findFirst();
  
  if (!existing) {
    throw new Error('Privacy policy not found');
  }
  
  return await prisma.privacyPolicy.delete({
    where: { id: existing.id }
  });
};