const express = require('express');
const authRoutes = require('./auth.route');
const profileRoutes = require('./profile.routes');
const adminInterests=  require('./travelInterest.routes');
const tripRoutes=require('./trip.routes')
const router = express.Router();

router.use('/auth', authRoutes);
router.use('/profile', profileRoutes);
router.use('/admin/interests', adminInterests);
router.use('/trip', tripRoutes);

module.exports = router;