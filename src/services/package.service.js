const { prisma } = require('../config/prisma');

// Get all active packages
exports.getActivePackages = async () => {
  try {
    const packages = await prisma.package.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { price: 'asc' },
      select: {
        id: true,
        name: true,
        price: true,
        features: true,
        status: true,
        createdAt: true
      }
    });

    return packages.map(pkg => ({
      ...pkg,
      priceInEuros: (pkg.price / 100).toFixed(2),
      priceInCents: pkg.price
    }));
  } catch (error) {
    console.error('❌ Error fetching active packages:', error);
    throw error;
  }
};

// Get package by ID
exports.getPackageById = async (id) => {
  try {
    const pkg = await prisma.package.findUnique({
      where: { id, status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        price: true,
        features: true,
        status: true,
        createdAt: true
      }
    });

    if (!pkg) return null;

    return {
      ...pkg,
      priceInEuros: (pkg.price / 100).toFixed(2),
      priceInCents: pkg.price
    };
  } catch (error) {
    console.error('❌ Error fetching package by ID:', error);
    throw error;
  }
};

// Get available packages for a specific trip
exports.getTripPackages = async (tripId) => {
  try {
    // Check if trip exists and get its details
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { album: true }
    });

    if (!trip) {
      throw new Error('Trip not found');
    }

    // Check if HD album already exists for this trip
    const hasExistingHD = trip.album?.hdAccess || false;

    // Get all active packages
    const packages = await prisma.package.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { price: 'asc' },
      select: {
        id: true,
        name: true,
        price: true,
        features: true,
        status: true
      }
    });

    // Filter packages based on trip status and existing HD access
    const availablePackages = packages.map(pkg => ({
      ...pkg,
      priceInEuros: (pkg.price / 100).toFixed(2),
      priceInCents: pkg.price,
      available: !hasExistingHD, // Package is available if no HD access exists
      reason: hasExistingHD ? 'HD album already available for this trip' : 'Available for purchase'
    }));

    return {
      tripId,
      tripName: trip.name,
      hasExistingHD,
      packages: availablePackages,
      totalPackages: availablePackages.length,
      availablePackages: availablePackages.filter(pkg => pkg.available).length
    };
  } catch (error) {
    console.error('❌ Error fetching trip packages:', error);
    throw error;
  }
};

// Validate package selection for a trip
exports.validatePackageForTrip = async (tripId, packageId) => {
  try {
    // Check if trip exists
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { album: true }
    });

    if (!trip) {
      return {
        valid: false,
        reason: 'Trip not found'
      };
    }

    // Check if package exists and is active
    const pkg = await prisma.package.findUnique({
      where: { id: packageId, status: 'ACTIVE' }
    });

    if (!pkg) {
      return {
        valid: false,
        reason: 'Package not found or inactive'
      };
    }

    // Check if HD album already exists
    if (trip.album?.hdAccess) {
      return {
        valid: false,
        reason: 'HD album already available for this trip',
        existingHD: true
      };
    }

    // Check if user is a member of the trip (this would be done in the controller with auth)
    // For now, we'll assume the validation is for a valid trip member

    // Check if there's already a completed payment for this trip
    const existingPayment = await prisma.payment.findFirst({
      where: {
        tripId,
        type: 'album_hd',
        status: 'completed'
      }
    });

    if (existingPayment) {
      return {
        valid: false,
        reason: 'HD album already purchased for this trip',
        existingPayment: true
      };
    }

    return {
      valid: true,
      package: {
        id: pkg.id,
        name: pkg.name,
        price: pkg.price,
        priceInEuros: (pkg.price / 100).toFixed(2),
        features: pkg.features
      },
      trip: {
        id: trip.id,
        name: trip.name,
        status: trip.status
      },
      canPurchase: true
    };
  } catch (error) {
    console.error('❌ Error validating package for trip:', error);
    throw error;
  }
};

// Get package pricing information (public endpoint)
exports.getPackagePricing = async () => {
  try {
    const packages = await prisma.package.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { price: 'asc' },
      select: {
        id: true,
        name: true,
        price: true,
        features: true
      }
    });

    return {
      currency: 'EUR',
      packages: packages.map(pkg => ({
        ...pkg,
        priceInEuros: (pkg.price / 100).toFixed(2),
        priceInCents: pkg.price
      })),
      totalPackages: packages.length,
      priceRange: {
        min: packages.length > 0 ? (packages[0].price / 100).toFixed(2) : '0.00',
        max: packages.length > 0 ? (packages[packages.length - 1].price / 100).toFixed(2) : '0.00'
      }
    };
  } catch (error) {
    console.error('❌ Error fetching package pricing:', error);
    throw error;
  }
};
