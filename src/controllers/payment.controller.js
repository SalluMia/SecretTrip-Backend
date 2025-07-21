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

    console.log(`📦 Webhook received: ${event.type}`);

    // Handle different event types
    switch (event.type) {
      case 'payment_intent.succeeded':
        console.log('✅ Payment succeeded, updating status...');
        await paymentService.handlePaymentSuccess(event.data.object.id);
        break;
      
      case 'payment_intent.payment_failed':
        console.log('❌ Payment failed, updating status...');
        await paymentService.handlePaymentFailure(event.data.object.id);
        break;

      case 'payment_intent.canceled':
        console.log('🚫 Payment canceled, updating status...');
        await paymentService.handlePaymentCanceled(event.data.object.id);
        break;

      case 'charge.succeeded':
        console.log('💳 Charge succeeded, ensuring payment status is updated...');
        await paymentService.handleChargeSuccess(event.data.object.payment_intent);
        break;

      case 'charge.failed':
        console.log('💳 Charge failed, updating payment status...');
        await paymentService.handleChargeFailure(event.data.object.payment_intent);
        break;

      case 'charge.refunded':
        console.log('💰 Charge refunded, updating payment status...');
        await paymentService.handleChargeRefunded(event.data.object.payment_intent);
        break;
      
      default:
        console.log(`📝 Unhandled event type: ${event.type}`);
    }

    res.json({ received: true, eventType: event.type });
  } catch (err) {
    console.error('❌ Webhook error:', err.message);
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


// Get comprehensive admin revenue analytics directly from Stripe
exports.getAdminRevenueAnalytics = async (req, res, next) => {
  try {
    const {
      startDate,
      endDate,
      groupBy = 'monthly', // monthly, yearly, daily, weekly, all
      period = 'all', // current-month, current-year, last-month, last-year, last-7-days, last-30-days, last-90-days, custom, all
      timezone = 'UTC',
      year, // for getting specific year data
      includeBalance = 'false', // include Stripe balance info
      includeFees = 'false' // include detailed fee breakdown
    } = req.query;

    // Validate groupBy parameter
    const validGroupBy = ['monthly', 'yearly', 'daily', 'weekly', 'all'];
    if (groupBy && !validGroupBy.includes(groupBy)) {
      return errorResponse(res, 400, 'Invalid groupBy parameter. Must be one of: monthly, yearly, daily, weekly, all');
    }

    // Validate period parameter
    const validPeriods = ['current-month', 'current-year', 'last-month', 'last-year', 'last-7-days', 'last-30-days', 'last-90-days', 'custom', 'all'];
    if (period && !validPeriods.includes(period)) {
      return errorResponse(res, 400, 'Invalid period parameter. Must be one of: ' + validPeriods.join(', '));
    }

    // Handle specific year filtering
    let calculatedStartDate = startDate;
    let calculatedEndDate = endDate;
    
    if (year) {
      const targetYear = parseInt(year);
      if (isNaN(targetYear) || targetYear < 2020 || targetYear > new Date().getFullYear()) {
        return errorResponse(res, 400, 'Invalid year parameter');
      }
      calculatedStartDate = new Date(targetYear, 0, 1);
      calculatedEndDate = new Date(targetYear, 11, 31, 23, 59, 59);
    }

    // Validate custom date parameters if period is custom
    if (period === 'custom') {
      if (!startDate || !endDate) {
        return errorResponse(res, 400, 'startDate and endDate are required for custom period');
      }
      
      if (!isValidDate(startDate) || !isValidDate(endDate)) {
        return errorResponse(res, 400, 'Invalid date format. Use YYYY-MM-DD');
      }

      const start = new Date(startDate);
      const end = new Date(endDate);

      if (start > end) {
        return errorResponse(res, 400, 'startDate cannot be after endDate');
      }
    }

    // Get main analytics from Stripe
    const analytics = await paymentService.getAdminRevenueAnalytics({
      startDate: calculatedStartDate,
      endDate: calculatedEndDate,
      groupBy,
      period,
      timezone
    });

    // Add additional Stripe data if requested
    const additionalData = {};

    if (includeBalance === 'true') {
      try {
        additionalData.balanceInfo = await paymentService.getStripeBalanceInfo();
      } catch (error) {
        console.error('Error fetching balance info:', error);
        additionalData.balanceInfo = null;
      }
    }

    if (includeFees === 'true' && calculatedStartDate && calculatedEndDate) {
      try {
        additionalData.feeAnalytics = await paymentService.getStripeFeeAnalytics(
          new Date(calculatedStartDate), 
          new Date(calculatedEndDate)
        );
      } catch (error) {
        console.error('Error fetching fee analytics:', error);
        additionalData.feeAnalytics = null;
      }
    }

    // Combine all data
    const responseData = {
      ...analytics,
      ...additionalData,
      filters: {
        groupBy,
        period,
        year: year || null,
        timezone,
        customDateRange: period === 'custom' ? { startDate, endDate } : null,
        includeBalance: includeBalance === 'true',
        includeFees: includeFees === 'true'
      },
      generatedAt: new Date().toISOString(),
      dataSource: 'stripe'
    };

    successResponse(res, 200, 'Stripe revenue analytics retrieved successfully', responseData);
  } catch (err) {
    // Handle Stripe API errors specifically
    if (err.type === 'StripeError') {
      return errorResponse(res, 400, `Stripe API Error: ${err.message}`);
    }
    next(err);
  }
};

// Unified direct payment processing
exports.processDirectPayment = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { tripId, albumId, amount } = req.body;

    // Validation
    if (!tripId || !albumId) {
      return errorResponse(res, 400, 'Trip ID and Album ID are required');
    }

    if (!amount || amount < 100) { // Minimum 1 euro in cents
      return errorResponse(res, 400, 'Valid amount is required (minimum €1.00)');
    }

    const paymentResult = await paymentService.processDirectPayment({
      userId,
      tripId,
      albumId,
      amount
    });

    successResponse(res, 200, 'Payment processed successfully', paymentResult);
  } catch (err) {
    next(err);
  }
};

// Check if HD album is available for trip
exports.checkHDAvailability = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { tripId } = req.params;

    const availability = await paymentService.checkHDAvailability(userId, tripId);
    successResponse(res, 200, 'HD album availability checked', availability);
  } catch (err) {
    next(err);
  }
};

// Helper function to validate date format
function isValidDate(dateString) {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
}