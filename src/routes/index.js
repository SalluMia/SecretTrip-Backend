const express = require('express');
const authRoutes = require('./auth.route');
const profileRoutes = require('./profile.routes');
const adminInterests=  require('./travelInterest.routes');
const tripRoutes=require('./trip.routes')
const homeRoutes=require('./home.routes')
const adminRoutes=require('./admin.routes')
const router = express.Router();

router.use('/auth', authRoutes);
router.use('/profile', profileRoutes);
router.use('/admin/interests', adminInterests);
router.use('/trip', tripRoutes);
router.use('/home', homeRoutes);
router.use('/admin', adminRoutes);

module.exports = router;