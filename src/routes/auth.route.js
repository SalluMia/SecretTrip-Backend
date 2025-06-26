const express = require('express');
const passport = require('passport');
const { signup, login, verifyOTP, resendOTP, forgotPassword, verifyResetToken, resetPassword, logout, removeFCMToken, testFCMToken } = require('../controllers/auth.controller');
const jwt = require('jsonwebtoken');
const { updateFCMToken } = require('../controllers/trip.controller');
const auth = require('../middlewares/auth');
const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/verify-otp', verifyOTP);
router.post('/resend-otp', resendOTP);
router.post('/forgot-password', forgotPassword);
router.get('/verify-reset-token/:token', verifyResetToken);
router.post('/reset-password', resetPassword);
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    const token = jwt.sign({ id: req.user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.redirect(`http://localhost:5173/success?token=${token}`);
  }
);

router.use(auth); // Apply auth middleware to all routes below

// Logout with FCM token clearing
router.post('/logout', logout);

// FCM Token management endpoints
// router.put('/fcm-token', updateFCMToken);
router.delete('/fcm-token', removeFCMToken);
router.post('/fcm-token/test', testFCMToken);

module.exports = router;
