const { prisma } = require('../config/prisma');



// ============== ADMIN DASHBOARD STATS SERVICE FUNCTION ==============

exports.getAdminDashboardStats = async () => {
  try {
    // Get basic counts
    const [
      totalUsers,
      activeUsers,
      blockedUsers,
      totalTrips,
      activeTrips,
      upcomingTrips,
      completedTrips,
      totalMissions,
      completedMissions,
      totalMissionTemplates,
      aestheticMissions,
      secretAgentMissions
    ] = await Promise.all([
      // User stats
      prisma.user.count(),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count({ where: { status: 'BLOCKED' } }),
      
      // Trip stats
      prisma.trip.count(),
      prisma.trip.count({ where: { status: 'ACTIVE' } }),
      prisma.trip.count({ where: { status: 'UPCOMING' } }),
      prisma.trip.count({ where: { status: 'COMPLETED' } }),
      
      // Mission stats
      prisma.assignedMission.count(),
      prisma.assignedMission.count({ where: { completed: true } }),
      
      // Mission template stats
      prisma.missionTemplate.count(),
      prisma.missionTemplate.count({ where: { category: 'AESTHETIC' } }),
      prisma.missionTemplate.count({ where: { category: 'SECRET_AGENT' } })
    ]);

    // Get recent users (last 5)
    const recentUsers = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        displayName: true,
        email: true,
        status: true,
        profilePhotoUrl: true,
        createdAt: true
      }
    });

    // Get recent trips (last 5)
    const recentTrips = await prisma.trip.findMany({
      orderBy: { startDate: 'desc' },
      take: 5,
      include: {
        members: true,
        album: true
      }
    });

    // Get recent mission templates (last 5)
    const recentMissionTemplates = await prisma.missionTemplate.findMany({
      orderBy: { id: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        instruction: true,
        location: true,
        category: true,
        level: true
      }
    });

    // Calculate inactive users
    const inactiveUsers = totalUsers - activeUsers - blockedUsers;

    // Format trips data
    const formattedTrips = recentTrips.map(trip => ({
      id: trip.id,
      name: trip.name,
      startDate: trip.startDate,
      endDate: trip.endDate,
      status: trip.status.toLowerCase(),
      participants: trip.members.length,
      hdVersion: trip.album?.pdfHDUrl ? 'completed' : 'upcoming'
    }));

    // Return structured dashboard data
    return {
      // Main dashboard cards
      stats: {
        activeUsers,
        totalTrips,
        totalMissions,
        completedTrips
      },
      
      // Pie chart data for Trip Status
      tripStatus: {
        completed: completedTrips,
        active: activeTrips,
        upcoming: upcomingTrips
      },
      
      // Pie chart data for Mission Types
      missionTypes: {
        aesthetic: aestheticMissions,
        secretAgent: secretAgentMissions
      },
      
      // Pie chart data for User Activity
      userActivity: {
        active: activeUsers,
        inactive: inactiveUsers,
        blocked: blockedUsers
      },
      
      // Lists for dashboard sections
      users: recentUsers,
      trips: formattedTrips,
      missionTemplates: recentMissionTemplates,
      
      // Additional summary data
      summary: {
        totalUsers,
        activeUsers,
        blockedUsers,
        inactiveUsers,
        totalTrips,
        activeTrips,
        upcomingTrips,
        completedTrips,
        totalMissions,
        completedMissions,
        totalMissionTemplates,
        aestheticMissions,
        secretAgentMissions
      }
    };
    
  } catch (error) {
    console.error('Error fetching admin dashboard stats:', error);
    throw new Error('Failed to fetch dashboard statistics');
  }
};


exports.toggleUserStatus = async (userId, action) => {
  const newStatus = action === 'block' ? 'BLOCKED' : 'ACTIVE';
  
  // Validate UUID format (optional but recommended)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(userId)) {
    throw new Error('Invalid userId format - must be a valid UUID');
  }
  
  // First check if user exists
  const existingUser = await prisma.user.findUnique({
    where: { id: userId }
  });
  
  if (!existingUser) {
    throw new Error(`User with ID ${userId} not found`);
  }
  
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
  console.log(userId);
  

  
  // First check if user exists
  const existingUser = await prisma.user.findUnique({
    where: { id: userId }
  });
   console.log(existingUser)

  if (!existingUser) {
    throw new Error(`User with ID ${userId} not found`);
  }
  
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
      location: m.location,
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

exports.createMissionTemplate = async ({ title, instruction, location, category, level }) => {
  return await prisma.missionTemplate.create({
    data: {
      title,
      instruction,
      location,
      category,
      level
    }
  });
};

exports.getAllMissionTemplates = async (filters = {}) => {
  const { category, level, search } = filters;
  
  const where = {};
  
  // Filter by type (AESTHETIC or SECRET_AGENT)
  if (category && ['AESTHETIC', 'SECRET_AGENT'].includes(category)) {
    where.category = category;
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

exports.updateMissionTemplate = async (id, { title, instruction, location, category, level }) => {
  const existing = await prisma.missionTemplate.findUnique({ where: { id } });
  if (!existing) throw new Error('Mission template not found');
  
  return await prisma.missionTemplate.update({
    where: { id },
    data: {
      title,
      instruction,
      location,
      category,
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

// Create policy with both EN + FR
exports.createPrivacyPolicy = async ({ contentEn, contentFr }) => {
  const existing = await prisma.privacyPolicy.findFirst();

  if (existing) {


    return await prisma.privacyPolicy.update({
      where: { id: existing.id },
      data: {
        contentEn: contentEn || existing.contentEn,
        contentFr: contentFr || existing.contentFr,
        updatedAt: new Date()
      }
    });
  }

  return await prisma.privacyPolicy.create({
    data: {
      contentEn,
      contentFr,
    }
  });
};


exports.getPrivacyPolicy = async () => {
  return await prisma.privacyPolicy.findFirst({
    where: { isActive: true }
  });
};

exports.updatePrivacyPolicy = async ({ contentEn, contentFr, isActive }) => {
  const existing = await prisma.privacyPolicy.findFirst();
  if (!existing) throw new Error('Privacy policy not found');

  const isContentEnChanged = contentEn !== undefined && contentEn !== existing.contentEn;
  const isContentFrChanged = contentFr !== undefined && contentFr !== existing.contentFr;


  return await prisma.privacyPolicy.update({
    where: { id: existing.id },
    data: {
      ...(isContentEnChanged && { contentEn }),
      ...(isContentFrChanged && { contentFr }),
      ...(isActive !== undefined && { isActive }),
    }
  });
};



exports.deletePrivacyPolicy = async () => {
  const existing = await prisma.privacyPolicy.findFirst();
  if (!existing) throw new Error('Privacy policy not found');

  return await prisma.privacyPolicy.delete({ where: { id: existing.id } });
};
