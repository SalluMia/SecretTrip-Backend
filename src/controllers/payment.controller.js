const paymentService =require('../services/payment.service')
const { successResponse, errorResponse } = require('../utils/response');

// Unified payment endpoint (handles both payment intent creation and success processing)
// Supports both React (web) and Flutter (mobile) clients
exports.unifiedPayment = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { 
      tripId, 
      albumId, 
      packageId, // New: package ID instead of static amount
      paymentType = 'hd-album', 
      paymentIntentId, 
      isSuccess = false,
      platform = 'web', // 'web' for React, 'mobile' for Flutter
      paymentMethodData = null // For Flutter: card details if needed
    } = req.body;

    // Validation
    if (!tripId || !albumId) {
      return errorResponse(res, 400, 'Trip ID and Album ID are required');
    }

    if (!packageId) {
      return errorResponse(res, 400, 'Package ID is required');
    }

    let paymentResult;

    // If this is a success call (frontend has completed payment with Stripe)
    if (isSuccess && paymentIntentId) {
      console.log(`🎉 Processing payment success in unified endpoint - PaymentIntent: ${paymentIntentId}, Platform: ${platform}`);
      
      paymentResult = await paymentService.handleDirectPaymentSuccess({
        userId,
        tripId,
        albumId,
        paymentIntentId,
        packageId
      });

      successResponse(res, 200, 'Payment processed successfully', paymentResult);
      return;
    }

    // Create payment intent based on platform and payment type
    switch (paymentType) {
      case 'hd-album':
        if (platform === 'mobile') {
          // For Flutter: Create intent and return client secret for Stripe SDK
          paymentResult = await paymentService.createHDAlbumPaymentIntentForMobile({
            userId,
            tripId,
            albumId,
            packageId
          });
        } else {
          // For React: Standard web flow
          paymentResult = await paymentService.createHDAlbumPaymentIntent({
            userId,
            tripId,
            albumId,
            packageId
          });
        }
        break;
      
      case 'direct':
        if (platform === 'mobile' && paymentMethodData) {
          // For Flutter: Process direct payment with card data
          paymentResult = await paymentService.processDirectPaymentForMobile({
            userId,
            tripId,
            albumId,
            packageId,
            paymentMethodData
          });
        } else {
          // For React: Standard direct payment
          paymentResult = await paymentService.processDirectPayment({
            userId,
            tripId,
            albumId,
            packageId
          });
        }
        break;
      
      default:
        return errorResponse(res, 400, 'Invalid payment type. Must be "hd-album" or "direct"');
    }

    // Add platform-specific response data
    const responseData = {
      ...paymentResult,
      platform,
      paymentType,
      instructions: platform === 'mobile' ? {
        nextStep: 'Use client_secret with Stripe SDK to confirm payment',
        sdkMethod: 'Stripe.instance.confirmPayment(clientSecret, paymentMethodParams)'
      } : {
        nextStep: 'Use paymentIntentId with Stripe Elements to confirm payment',
        sdkMethod: 'stripe.confirmPayment({elements, confirmParams})'
      }
    };

    successResponse(res, 200, 'Payment intent created', responseData);
  } catch (err) {
    next(err);
  }
};

// Handle payment success (called from frontend after successful payment)
exports.handlePaymentSuccess = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { paymentIntentId, tripId, albumId, amount } = req.body;

    if (!paymentIntentId || !tripId || !albumId) {
      return errorResponse(res, 400, 'Payment intent ID, trip ID, and album ID are required');
    }

    const result = await paymentService.handleDirectPaymentSuccess({
      userId,
      tripId,
      albumId,
      paymentIntentId,
      amount
    });

    successResponse(res, 200, 'Payment processed successfully', result);
  } catch (err) {
    next(err);
  }
};

// Check HD access for a trip
exports.checkHDAccess = async (req, res, next) => {
  try {
    const { tripId } = req.params;
    
    const hdAccess = await paymentService.checkHDAccess(tripId);
    successResponse(res, 200, 'HD access checked', hdAccess);
  } catch (err) {
    next(err);
  }
};

// Legacy endpoints for backward compatibility
exports.createHDAlbumPayment = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { tripId, albumId ,amount} = req.body;

    if (!tripId || !albumId || !amount) {
      return errorResponse(res, 400, 'Trip ID and Album ID are required');
    }

    const paymentIntent = await paymentService.createHDAlbumPaymentIntent({
      userId,
      tripId,
      albumId,
      amount
    });

    successResponse(res, 200, 'Payment intent created', paymentIntent);
  } catch (err) {
    next(err);
  }
};

// Handle Stripe webhook (legacy - kept for compatibility)
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
    const { tripId, albumId, packageId } = req.body;

    // Validation
    if (!tripId || !albumId) {
      return errorResponse(res, 400, 'Trip ID and Album ID are required');
    }

    if (!packageId) {
      return errorResponse(res, 400, 'Package ID is required');
    }

    const paymentResult = await paymentService.processDirectPayment({
      userId,
      packageId,
      tripId,
      albumId
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

// Flutter SDK integration guide endpoint
exports.getFlutterIntegrationGuide = async (req, res, next) => {
  try {
    const guide = {
      title: 'Flutter Stripe Integration Guide',
      version: '1.0.0',
      platform: 'mobile',
      endpoints: {
        createPaymentIntent: {
          url: 'POST /api/payments/unified',
          method: 'POST',
          headers: {
            'Authorization': 'Bearer {token}',
            'Content-Type': 'application/json'
          },
          body: {
            tripId: 'string (required)',
            albumId: 'string (required)',
            packageId: 'string (required)',
            paymentType: 'hd-album',
            platform: 'mobile'
          },
          response: {
            success: true,
            data: {
              paymentIntentId: 'pi_1234567890',
              clientSecret: 'pi_1234567890_secret_abc123',
              amount: 299,
              currency: 'eur',
              paymentId: 'uuid',
              platform: 'mobile',
              sdkInstructions: {
                method: 'Stripe.instance.confirmPayment',
                params: 'clientSecret, PaymentMethodParams.card(paymentMethodData)'
              }
            }
          }
        },
        confirmPayment: {
          url: 'POST /api/payments/unified',
          method: 'POST',
          headers: {
            'Authorization': 'Bearer {token}',
            'Content-Type': 'application/json'
          },
          body: {
            tripId: 'string (required)',
            albumId: 'string (required)',
            packageId: 'string (required)',
            paymentIntentId: 'string (required)',
            isSuccess: true
          }
        }
      },
      flutterCode: {
        dependencies: `
dependencies:
  flutter_stripe: ^10.0.0
  http: ^1.1.0
        `,
        setup: `
// main.dart
import 'package:flutter_stripe/flutter_stripe.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  Stripe.publishableKey = 'pk_test_your_publishable_key';
  runApp(MyApp());
}
        `,
        paymentFlow: `
// 1. Create payment intent
final response = await http.post(
  Uri.parse('${process.env.BACKEND_URL}/api/payments/unified'),
  headers: {
    'Authorization': 'Bearer $token',
    'Content-Type': 'application/json',
  },
  body: jsonEncode({
    'tripId': tripId,
    'albumId': albumId,
    'packageId': packageId,
    'paymentType': 'hd-album',
    'platform': 'mobile'
  }),
);

final paymentData = jsonDecode(response.body)['data'];
final clientSecret = paymentData['clientSecret'];

// 2. Confirm payment with Stripe SDK
try {
  await Stripe.instance.confirmPayment(
    clientSecret,
    PaymentMethodParams.card(
      paymentMethodData: PaymentMethodData(
        billingDetails: billingDetails,
      ),
    ),
  );
  
  // 3. Notify backend of success
  await http.post(
    Uri.parse('${process.env.BACKEND_URL}/api/payments/unified'),
    headers: {
      'Authorization': 'Bearer $token',
      'Content-Type': 'application/json',
    },
    body: jsonEncode({
      'tripId': tripId,
      'albumId': albumId,
      'packageId': packageId,
      'paymentIntentId': paymentData['paymentIntentId'],
      'isSuccess': true
    }),
  );
  
  print('Payment successful!');
} catch (e) {
  print('Payment failed: $e');
}
        `,
        errorHandling: `
// Error handling
try {
  // Payment flow code here
} catch (e) {
  if (e is StripeException) {
    switch (e.error.code) {
      case 'card_declined':
        // Handle card declined
        break;
      case 'insufficient_funds':
        // Handle insufficient funds
        break;
      default:
        // Handle other errors
        break;
    }
  }
}
        `
      },
      bestPractices: [
        'Always create payment intent on backend (not client-side)',
        'Use client_secret with Stripe SDK for payment confirmation',
        'Notify backend after successful payment',
        'Handle payment errors gracefully',
        'Store payment records in backend database',
        'Use proper error handling for network requests'
      ],
      securityNotes: [
        'Never expose Stripe secret key in Flutter app',
        'Always validate payment on backend',
        'Use HTTPS for all API calls',
        'Implement proper authentication'
      ]
    };

    successResponse(res, 200, 'Flutter integration guide retrieved', guide);
  } catch (err) {
    next(err);
  }
};