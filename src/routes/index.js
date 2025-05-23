const express = require('express');
const authRoutes = require('./auth.route');
const profileRoutes = require('./profile.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/profile', profileRoutes);

module.exports = router;