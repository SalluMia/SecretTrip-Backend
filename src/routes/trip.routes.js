const express = require('express');
const {
  createTrip,
  joinTrip,
  getPendingRequests,
  respondToRequest,
  getMyTrips
} = require('../controllers/trip.controller');

const auth = require('../middlewares/auth');

const router = express.Router();

router.use(auth); 

router.post('/create', createTrip);
router.post('/join', joinTrip);
router.get('/:tripId/requests', getPendingRequests);
router.put('/:tripId/requests/:userId', respondToRequest);
router.get('/my', getMyTrips);

module.exports = router;
