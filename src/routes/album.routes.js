const express = require('express');
const router = express.Router();
const albumController = require('../controllers/album.controller');
const auth = require('../middlewares/auth');

router.get('/admin/all', albumController.getAllAlbumsForAdmin);

router.use(auth); // Protect all album routes

// Get album access information
router.get('/trip/:tripId', albumController.getAlbumAccess);

// Download album (standard or HD)
router.get('/trip/:tripId/download', albumController.downloadAlbumPDF);

// Get trip photos for album preview
router.get('/trip/:tripId/photos', albumController.getTripPhotos);
router.get('/:tripId/overview', auth, albumController.getTripAlbumOverview);

// Screen 17: Album Preview with all photos
// GET /api/trip-albums/:tripId/preview  
router.get('/:tripId/preview', auth, albumController.getAlbumPreview);

router.post('/trip/:tripId/generate', albumController.generateTestAlbum);

module.exports = router;