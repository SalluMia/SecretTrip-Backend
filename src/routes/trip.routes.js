const express = require('express');
const router = express.Router();
const tripController = require('../controllers/trip.controller');
const auth = require('../middlewares/auth');

router.use(auth); // 🛡️ Middleware protection

router.post('/create', tripController.createTrip);
router.post('/join', tripController.joinTrip);
router.put('/:tripId/requests/:userId', tripController.respondToRequest);
router.get('/:tripId/requests', tripController.getPendingRequests);
router.get('/my', tripController.getMyTrips);
router.get('/status', tripController.getTripsByStatus); 
router.get('/details/:tripId', tripController.getTripDetails); 
router.get('/album/preview/:tripId', tripController.getTripAlbumPreview); 

router.post('/:tripId/activate', tripController.activateTrip);
router.get('/:tripId/missions', tripController.getMyMissions);
router.put('/missions/:missionId/swap', tripController.swapMission);
router.post('/missions/:missionId/submit', tripController.submitMissionPhoto);



router.get('/preview/:code', tripController.getTripByCode);

// Enhanced join trip with better validation
router.post('/join-enhanced', tripController.joinTripEnhanced);

// Enhanced respond to request with notifications
router.put('/:tripId/requests-enhanced/:userId', tripController.respondToRequestEnhanced);

// Get trip members with aliases
router.get('/:tripId/members', tripController.getTripMembers);

// Enhanced activate trip with notifications
router.post('/:tripId/activate-enhanced', tripController.activateTripEnhanced);

// Get pending requests with enhanced details
router.get('/:tripId/requests-enhanced', tripController.getPendingRequestsEnhanced);

// Check alias availability
router.get('/check-alias', tripController.checkAliasAvailability);

// Update FCM token for notifications
router.post('/fcm-token', tripController.updateFCMToken);


module.exports = router;
