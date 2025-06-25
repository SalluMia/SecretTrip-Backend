const albumService = require('../services/album.service');
const paymentService = require('../services/payment.service');

// Get album access information
exports.getAlbumAccess = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { tripId } = req.params;

    const albumAccess = await albumService.getAlbumAccess(tripId, userId);
    const paymentInfo = await paymentService.getTripPaymentInfo(tripId);

    successResponse(res, 200, 'Album access information retrieved', {
      ...albumAccess,
      paymentInfo
    });
  } catch (err) {
    next(err);
  }
};

// Download album (standard or HD)
exports.downloadAlbum = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { tripId } = req.params;
    const { quality = 'standard' } = req.query;

    const albumAccess = await albumService.getAlbumAccess(tripId, userId);
    
    if (!albumAccess.available) {
      return errorResponse(res, 404, 'Album not available');
    }

    let downloadUrl;
    if (quality === 'hd') {
      if (!albumAccess.hasHDAccess) {
        return errorResponse(res, 403, 'HD access not purchased');
      }
      downloadUrl = albumAccess.hdPdfUrl;
    } else {
      if (albumAccess.freeAccessExpired) {
        return errorResponse(res, 403, 'Free access has expired. Please upgrade to HD.');
      }
      downloadUrl = albumAccess.standardPdfUrl;
    }

    if (!downloadUrl) {
      return errorResponse(res, 404, 'Album file not found');
    }

    // Return download URL (or serve file directly)
    successResponse(res, 200, 'Album download ready', {
      downloadUrl,
      quality,
      expiresAt: quality === 'standard' ? albumAccess.expiresAt : null
    });
  } catch (err) {
    next(err);
  }
};

// Get trip photos for album preview
exports.getTripPhotos = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { tripId } = req.params;

    // Verify access
    const trip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        members: { some: { id: userId } }
      }
    });

    if (!trip) {
      return errorResponse(res, 403, 'Access denied to this trip');
    }

    const photos = await missionPhotoService.getTripPhotos(tripId);
    
    successResponse(res, 200, 'Trip photos retrieved', {
      photos,
      totalPhotos: photos.length,
      tripName: trip.name
    });
  } catch (err) {
    next(err);
  }
};
