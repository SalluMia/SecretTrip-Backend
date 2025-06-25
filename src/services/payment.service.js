// src/services/payment.service.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { prisma } = require('../config/prisma');

const HD_ALBUM_PRICE = 299; // in cents (€2.99)
const CURRENCY = 'eur';

exports.createHDAlbumPaymentIntent = async function ({ userId, tripId, albumId }) {
  try {
    const trip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        members: { some: { id: userId } }
      },
      include: {
        album: true,
        members: true
      }
    });

    if (!trip) throw new Error('Trip not found or access denied');
    if (!trip.album || trip.album.id !== albumId) throw new Error('Album not found for this trip');

    const existingPayment = await prisma.payment.findFirst({
      where: {
        tripId,
        type: 'album_hd',
        status: 'completed'
      }
    });

    if (existingPayment) throw new Error('HD album already purchased for this trip');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true }
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: HD_ALBUM_PRICE,
      currency: CURRENCY,
      automatic_payment_methods: { enabled: true },
      metadata: {
        userId,
        tripId,
        albumId,
        type: 'album_hd',
        userEmail: user.email,
        userName: user.displayName,
        tripName: trip.name
      },
      description: `Secret Trip HD Album - ${trip.name}`,
      receipt_email: user.email
    });

    const payment = await prisma.payment.create({
      data: {
        userId,
        tripId,
        type: 'album_hd',
        amount: HD_ALBUM_PRICE,
        currency: CURRENCY,
        status: 'pending',
        stripePaymentIntentId: paymentIntent.id
      }
    });

    return {
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      amount: HD_ALBUM_PRICE,
      currency: CURRENCY,
      paymentId: payment.id
    };
  } catch (error) {
    console.error('Error creating payment intent:', error);
    throw error;
  }
};

exports.handlePaymentSuccess = async function (paymentIntentId) {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      throw new Error('Payment not successful');
    }

    const { userId, tripId, albumId } = paymentIntent.metadata;

    await prisma.payment.update({
      where: { stripePaymentIntentId: paymentIntentId },
      data: { status: 'completed' }
    });

    const albumService = require('./album.service');
    const hdPdfUrl = await albumService.generateHDVersion(albumId);

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { members: true, tripAliases: true }
    });

    const purchaser = await prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true }
    });

    const notificationService = require('./notification.service');

    for (const member of trip.members) {
      const alias = trip.tripAliases.find(ta => ta.userId === member.id)?.alias || 'Agent';
      try {
        await notificationService.sendHDAlbumAvailableNotification({
          userId: member.id,
          tripName: trip.name,
          alias,
          purchaserName: purchaser.displayName,
          albumId
        });
      } catch (notifError) {
        console.error('Failed to send HD album notification:', notifError);
      }
    }

    console.log(`✅ HD album payment successful for trip ${trip.name}`);

    return {
      success: true,
      hdPdfUrl,
      message: 'HD album unlocked for all trip members'
    };
  } catch (error) {
    console.error('Error handling payment success:', error);
    throw error;
  }
};

exports.handlePaymentFailure = async function (paymentIntentId) {
  try {
    await prisma.payment.update({
      where: { stripePaymentIntentId: paymentIntentId },
      data: { status: 'failed' }
    });
    console.log(`❌ Payment failed for intent ${paymentIntentId}`);
  } catch (error) {
    console.error('Error handling payment failure:', error);
  }
};

exports.getPaymentStatus = async function (paymentId) {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        user: { select: { displayName: true, email: true } },
        trip: { select: { name: true } }
      }
    });

    if (!payment) throw new Error('Payment not found');

    let stripeStatus = null;
    if (payment.stripePaymentIntentId) {
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
        stripeStatus = paymentIntent.status;
      } catch (stripeError) {
        console.error('Error retrieving Stripe payment:', stripeError);
      }
    }

    return {
      id: payment.id,
      status: payment.status,
      stripeStatus,
      amount: payment.amount,
      currency: payment.currency,
      type: payment.type,
      tripName: payment.trip.name,
      purchaser: payment.user.displayName,
      createdAt: payment.timestamp
    };
  } catch (error) {
    throw error;
  }
};

exports.getUserPaymentHistory = async function (userId) {
  try {
    const payments = await prisma.payment.findMany({
      where: { userId },
      include: {
        trip: {
          select: { name: true, startDate: true, endDate: true }
        }
      },
      orderBy: { timestamp: 'desc' }
    });

    return payments.map(payment => ({
      id: payment.id,
      type: payment.type,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      tripName: payment.trip.name,
      tripDate: payment.trip.startDate,
      purchaseDate: payment.timestamp
    }));
  } catch (error) {
    throw error;
  }
};

exports.getTripPaymentInfo = async function (tripId) {
  try {
    const hdPayment = await prisma.payment.findFirst({
      where: {
        tripId,
        type: 'album_hd',
        status: 'completed'
      },
      include: {
        user: { select: { displayName: true } }
      }
    });

    return {
      hasHDAccess: !!hdPayment,
      purchasedBy: hdPayment?.user.displayName || null,
      purchaseDate: hdPayment?.timestamp || null,
      price: HD_ALBUM_PRICE,
      currency: CURRENCY
    };
  } catch (error) {
    throw error;
  }
};

exports.refundPayment = async function (paymentId, reason = 'Requested by customer') {
  try {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new Error('Payment not found');
    if (payment.status !== 'completed') throw new Error('Can only refund completed payments');

    const refund = await stripe.refunds.create({
      payment_intent: payment.stripePaymentIntentId,
      reason: 'requested_by_customer',
      metadata: { reason, refundedBy: 'admin' }
    });

    await prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'refunded' }
    });

    console.log(`💰 Refund processed for payment ${paymentId}`);

    return {
      success: true,
      refundId: refund.id,
      amount: refund.amount,
      status: refund.status
    };
  } catch (error) {
    console.error('Error processing refund:', error);
    throw error;
  }
};

exports.createOrGetCustomer = async function (userId) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true, stripeCustomerId: true }
    });

    if (!user) throw new Error('User not found');

    if (user.stripeCustomerId) {
      try {
        const customer = await stripe.customers.retrieve(user.stripeCustomerId);
        return customer;
      } catch (stripeError) {
        console.error('Error retrieving Stripe customer:', stripeError);
      }
    }

    const customer = await stripe.customers.create({
      email: user.email,
      name: user.displayName,
      metadata: { userId }
    });

    await prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customer.id }
    });

    return customer;
  } catch (error) {
    console.error('Error creating/getting customer:', error);
    throw error;
  }
};

exports.verifyWebhookSignature = function (payload, signature) {
  try {
    return stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    throw new Error('Invalid webhook signature');
  }
};

exports.getPaymentAnalytics = async function (startDate, endDate) {
  try {
    const whereClause = { status: 'completed' };

    if (startDate && endDate) {
      whereClause.timestamp = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    const payments = await prisma.payment.findMany({
      where: whereClause,
      include: {
        trip: {
          select: {
            name: true,
            members: { select: { id: true } }
          }
        }
      }
    });

    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
    const averageOrderValue = payments.length > 0 ? totalRevenue / payments.length : 0;

    return {
      totalPayments: payments.length,
      totalRevenue: totalRevenue / 100,
      averageOrderValue: averageOrderValue / 100,
      currency: CURRENCY,
      revenueByType: payments.reduce((acc, p) => {
        acc[p.type] = (acc[p.type] || 0) + p.amount;
        return acc;
      }, {}),
      paymentsByMonth: groupPaymentsByMonth(payments)
    };
  } catch (error) {
    throw error;
  }
};

function groupPaymentsByMonth(payments) {
  const grouped = {};
  payments.forEach(payment => {
    const monthKey = payment.timestamp.toISOString().substring(0, 7);
    if (!grouped[monthKey]) {
      grouped[monthKey] = { count: 0, revenue: 0 };
    }
    grouped[monthKey].count++;
    grouped[monthKey].revenue += payment.amount;
  });
  return grouped;
}
