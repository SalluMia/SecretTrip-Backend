const express = require('express');
const router = express.Router();
const albumController = require('../controllers/album.controller');
const auth = require('../middlewares/auth');

router.use(auth); // Protect all album routes

// Get album access information
router.get('/trip/:tripId', albumController.getAlbumAccess);

// Download album (standard or HD)
router.get('/trip/:tripId/download', albumController.downloadAlbum);

// Get trip photos for album preview
router.get('/trip/:tripId/photos', albumController.getTripPhotos);

module.exports = router;