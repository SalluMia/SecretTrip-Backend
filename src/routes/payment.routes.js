const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const auth = require('../middlewares/auth');

// Stripe webhook (no auth required)
router.post('/stripe/webhook', express.raw({ type: 'application/json' }), paymentController.handleStripeWebhook);

router.use(auth); // Protect other payment routes

// Unified direct payment processing
router.post('/direct', paymentController.processDirectPayment);

// Check HD album availability for trip
router.get('/hd-availability/:tripId', paymentController.checkHDAvailability);

// Create payment intent for HD album (legacy)
router.post('/hd-album', paymentController.createHDAlbumPayment);

// Get payment status
router.get('/:paymentId/status', paymentController.getPaymentStatus);

// Get user payment history
router.get('/history', paymentController.getUserPaymentHistory);

module.exports = router;