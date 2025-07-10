const express = require('express');
const router = express.Router();
const tripController = require('../controllers/trip.controller');
const auth = require('../middlewares/auth');

router.use(auth); // 🛡️ Middleware protection

// Core trip functionality
router.post('/create', tripController.createTrip);
router.get('/preview/:code', tripController.getTripByCode);
router.post('/join', tripController.joinTrip);
router.get('/check-alias', tripController.checkAliasAvailability);

router.put('/:tripId', tripController.editTrip);  
router.delete('/:tripId', tripController.deleteTrip);
router.post('/:tripId/leave', tripController.leaveTrip); // Leave trip
router.get('/:tripId/completed-missions', tripController.getTripCompletedMissions);
router.get('/history-missions', tripController.getUserCompletedMissionsHistory);
// Trip management
router.get('/my', tripController.getMyTrips);
router.get('/status', tripController.getTripsByStatus); 
router.get('/details/:tripId', tripController.getTripDetails); 
router.get('/:tripId/members', tripController.getTripMembers);

// Mission functionality
router.post('/:tripId/activate', tripController.activateTrip);
router.get('/:tripId/missions', tripController.getMyMissions);
router.put('/missions/:missionId/swap', tripController.swapMission);
router.post('/missions/:missionId/submit', tripController.submitMissionPhoto);

// Album functionality
router.get('/album/preview/:tripId', tripController.getTripAlbumPreview); 

module.exports = router;