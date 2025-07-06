const paymentService =require('../services/payment.service')
const { successResponse, errorResponse } = require('../utils/response');





exports.createHDAlbumPayment = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { tripId, albumId } = req.body;

    if (!tripId || !albumId) {
      return errorResponse(res, 400, 'Trip ID and Album ID are required');
    }

    const paymentIntent = await paymentService.createHDAlbumPaymentIntent({
      userId,
      tripId,
      albumId
    });

    successResponse(res, 200, 'Payment intent created', paymentIntent);
  } catch (err) {
    next(err);
  }
};

// Handle Stripe webhook
exports.handleStripeWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['stripe-signature'];
    const payload = req.body;

    // Verify webhook signature
    const event = paymentService.verifyWebhookSignature(payload, signature);

    // Handle different event types
    switch (event.type) {
      case 'payment_intent.succeeded':
        await paymentService.handlePaymentSuccess(event.data.object.id);
        break;
      
      case 'payment_intent.payment_failed':
        await paymentService.handlePaymentFailure(event.data.object.id);
        break;
      
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
};

// Get payment status
exports.getPaymentStatus = async (req, res, next) => {
  try {
    const { paymentId } = req.params;
    
    const paymentStatus = await paymentService.getPaymentStatus(paymentId);
    successResponse(res, 200, 'Payment status retrieved', paymentStatus);
  } catch (err) {
    next(err);
  }
};

// Get user payment history
exports.getUserPaymentHistory = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    const paymentHistory = await paymentService.getUserPaymentHistory(userId);
    successResponse(res, 200, 'Payment history retrieved', {
      payments: paymentHistory,
      totalPayments: paymentHistory.length
    });
  } catch (err) {
    next(err);
  }
};