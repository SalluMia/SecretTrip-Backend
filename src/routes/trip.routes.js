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

module.exports = router;
