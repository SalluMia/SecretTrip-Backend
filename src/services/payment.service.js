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
    console.log(`🔄 Processing webhook payment success for intent: ${paymentIntentId}`);
    
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      console.log(`⚠️ Payment intent status is ${paymentIntent.status}, not succeeded`);
      throw new Error('Payment not successful');
    }

    const { userId, tripId, albumId } = paymentIntent.metadata;
    console.log(`📋 Payment metadata - User: ${userId}, Trip: ${tripId}, Album: ${albumId}`);

    // Update payment status to completed when webhook succeeds
    const updatedPayment = await prisma.payment.update({
      where: { stripePaymentIntentId: paymentIntentId },
      data: { status: 'completed' }
    });
    console.log(`✅ Payment status updated to 'completed' for payment ID: ${updatedPayment.id}`);

    // Generate HD album
    const albumService = require('./album.service');
    console.log(`🖼️ Generating HD album for album ID: ${albumId}`);
    const hdPdfUrl = await albumService.generateHDVersion(albumId);
    console.log(`📄 HD album generated successfully: ${hdPdfUrl}`);

    // Get trip details for notifications
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { members: true, tripAliases: true }
    });

    const purchaser = await prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true }
    });

    console.log(`👥 Sending notifications to ${trip.members.length} trip members`);

    // Send notifications to all trip members
    const notificationService = require('./notification.service');
    const notificationPromises = trip.members.map(async (member) => {
      const alias = trip.tripAliases.find(ta => ta.userId === member.id)?.alias || 'Agent';
      try {
        await notificationService.sendHDAlbumAvailableNotification({
          userId: member.id,
          tripName: trip.name,
          alias,
          purchaserName: purchaser.displayName,
          albumId
        });
        console.log(`📱 Notification sent to user ${member.id} (${alias})`);
      } catch (notifError) {
        console.error(`❌ Failed to send HD album notification to user ${member.id}:`, notifError);
      }
    });

    // Send notifications in parallel
    await Promise.all(notificationPromises);

    console.log(`🎉 Webhook payment success processed - HD album unlocked for trip ${trip.name}`);

    return {
      success: true,
      hdPdfUrl,
      message: 'HD album unlocked for all trip members',
      paymentId: updatedPayment.id,
      paymentStatus: 'completed',
      tripName: trip.name,
      purchaserName: purchaser.displayName,
      memberCount: trip.members.length
    };
  } catch (error) {
    console.error('❌ Error handling webhook payment success:', error);
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

// Handle payment canceled
exports.handlePaymentCanceled = async function (paymentIntentId) {
  try {
    await prisma.payment.update({
      where: { stripePaymentIntentId: paymentIntentId },
      data: { status: 'canceled' }
    });
    console.log(`🚫 Payment canceled for intent ${paymentIntentId}`);
  } catch (error) {
    console.error('Error handling payment canceled:', error);
  }
};

// Handle charge success (additional safety check)
exports.handleChargeSuccess = async function (paymentIntentId) {
  try {
    // Check if payment is already marked as completed
    const payment = await prisma.payment.findFirst({
      where: { stripePaymentIntentId: paymentIntentId }
    });

    if (payment && payment.status !== 'completed') {
      await prisma.payment.update({
        where: { stripePaymentIntentId: paymentIntentId },
        data: { status: 'completed' }
      });
      console.log(`💳 Charge succeeded - payment status updated for intent ${paymentIntentId}`);
    }
  } catch (error) {
    console.error('Error handling charge success:', error);
  }
};

// Handle charge failure
exports.handleChargeFailure = async function (paymentIntentId) {
  try {
    await prisma.payment.update({
      where: { stripePaymentIntentId: paymentIntentId },
      data: { status: 'failed' }
    });
    console.log(`💳 Charge failed for intent ${paymentIntentId}`);
  } catch (error) {
    console.error('Error handling charge failure:', error);
  }
};

// Handle charge refunded
exports.handleChargeRefunded = async function (paymentIntentId) {
  try {
    await prisma.payment.update({
      where: { stripePaymentIntentId: paymentIntentId },
      data: { status: 'refunded' }
    });
    console.log(`💰 Charge refunded for intent ${paymentIntentId}`);
  } catch (error) {
    console.error('Error handling charge refunded:', error);
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

// Enhanced payment.service.js - Get revenue data directly from Stripe

// Get comprehensive revenue analytics directly from Stripe
exports.getAdminRevenueAnalytics = async function (options = {}) {
  try {
    const {
      startDate,
      endDate,
      groupBy = 'monthly', // 'monthly', 'yearly', 'daily', 'weekly', 'all'
      period = 'all', // 'current-month', 'current-year', 'last-month', 'last-year', 'custom', 'all'
      timezone = 'UTC'
    } = options;

    // Calculate date range based on period
    let calculatedStartDate = startDate;
    let calculatedEndDate = endDate;
    
    const now = new Date();
    switch (period) {
      case 'current-month':
        calculatedStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
        calculatedEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        break;
      case 'current-year':
        calculatedStartDate = new Date(now.getFullYear(), 0, 1);
        calculatedEndDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
        break;
      case 'last-month':
        calculatedStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        calculatedEndDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        break;
      case 'last-year':
        calculatedStartDate = new Date(now.getFullYear() - 1, 0, 1);
        calculatedEndDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
        break;
      case 'last-7-days':
        calculatedStartDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        calculatedEndDate = now;
        break;
      case 'last-30-days':
        calculatedStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        calculatedEndDate = now;
        break;
      case 'last-90-days':
        calculatedStartDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        calculatedEndDate = now;
        break;
      case 'custom':
        // Use provided startDate and endDate
        break;
      case 'all':
      default:
        // Get data from last 2 years if no specific range
        calculatedStartDate = new Date(now.getFullYear() - 2, 0, 1);
        calculatedEndDate = now;
        break;
    }

    // Fetch data from Stripe
    const stripeData = await fetchStripePaymentData(calculatedStartDate, calculatedEndDate);
    
    // Get additional customer data from Stripe
    const customerData = await fetchStripeCustomerData(stripeData.charges);
    
    // Process and analyze the data
    const analytics = await processStripeAnalytics(stripeData, customerData, groupBy);

    return {
      summary: {
        totalPayments: analytics.totalPayments,
        totalRevenue: analytics.totalRevenue / 100, // Convert to euros
        netRevenue: analytics.netRevenue / 100,
        totalFees: analytics.totalFees / 100,
        averageOrderValue: analytics.averageOrderValue / 100,
        currency: CURRENCY.toUpperCase()
      },
      revenueByType: analytics.revenueByType,
      timeSeriesData: analytics.timeSeriesData,
      topCustomers: analytics.topCustomers,
      growthMetrics: analytics.growthMetrics,
      stripeMetrics: {
        successfulCharges: analytics.successfulCharges,
        failedCharges: analytics.failedCharges,
        refunds: analytics.refunds,
        disputes: analytics.disputes
      },
      dateRange: {
        startDate: calculatedStartDate,
        endDate: calculatedEndDate,
        period,
        groupBy
      },
      dataSource: 'stripe'
    };
  } catch (error) {
    console.error('Error getting Stripe revenue analytics:', error);
    throw error;
  }
};

// Fetch payment data from Stripe
async function fetchStripePaymentData(startDate, endDate) {
  try {
    const charges = [];
    const refunds = [];
    const paymentIntents = [];
    
    // Convert dates to Unix timestamps
    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const endTimestamp = Math.floor(endDate.getTime() / 1000);

    // Fetch all charges
    let hasMoreCharges = true;
    let lastChargeId = null;
    
    while (hasMoreCharges) {
      const chargeParams = {
        limit: 100,
        created: {
          gte: startTimestamp,
          lte: endTimestamp
        }
      };
      
      if (lastChargeId) {
        chargeParams.starting_after = lastChargeId;
      }
      
      const chargeList = await stripe.charges.list(chargeParams);
      charges.push(...chargeList.data);
      
      hasMoreCharges = chargeList.has_more;
      if (hasMoreCharges) {
        lastChargeId = chargeList.data[chargeList.data.length - 1].id;
      }
    }

    // Fetch all refunds
    let hasMoreRefunds = true;
    let lastRefundId = null;
    
    while (hasMoreRefunds) {
      const refundParams = {
        limit: 100,
        created: {
          gte: startTimestamp,
          lte: endTimestamp
        }
      };
      
      if (lastRefundId) {
        refundParams.starting_after = lastRefundId;
      }
      
      const refundList = await stripe.refunds.list(refundParams);
      refunds.push(...refundList.data);
      
      hasMoreRefunds = refundList.has_more;
      if (hasMoreRefunds) {
        lastRefundId = refundList.data[refundList.data.length - 1].id;
      }
    }

    // Fetch payment intents for additional metadata
    let hasMorePaymentIntents = true;
    let lastPaymentIntentId = null;
    
    while (hasMorePaymentIntents) {
      const piParams = {
        limit: 100,
        created: {
          gte: startTimestamp,
          lte: endTimestamp
        }
      };
      
      if (lastPaymentIntentId) {
        piParams.starting_after = lastPaymentIntentId;
      }
      
      const piList = await stripe.paymentIntents.list(piParams);
      paymentIntents.push(...piList.data);
      
      hasMorePaymentIntents = piList.has_more;
      if (hasMorePaymentIntents) {
        lastPaymentIntentId = piList.data[piList.data.length - 1].id;
      }
    }

    return {
      charges,
      refunds,
      paymentIntents
    };
  } catch (error) {
    console.error('Error fetching Stripe payment data:', error);
    throw error;
  }
}

// Fetch customer data from Stripe
async function fetchStripeCustomerData(charges) {
  try {
    const customerIds = [...new Set(charges.filter(c => c.customer).map(c => c.customer))];
    const customers = [];
    
    // Fetch customer details in batches
    for (const customerId of customerIds) {
      try {
        const customer = await stripe.customers.retrieve(customerId);
        customers.push(customer);
      } catch (error) {
        console.error(`Error fetching customer ${customerId}:`, error);
      }
    }
    
    return customers;
  } catch (error) {
    console.error('Error fetching Stripe customer data:', error);
    throw error;
  }
}

// Process Stripe analytics
async function processStripeAnalytics(stripeData, customerData, groupBy) {
  const { charges, refunds, paymentIntents } = stripeData;
  
  // Filter successful charges only
  const successfulCharges = charges.filter(charge => charge.status === 'succeeded');
  const failedCharges = charges.filter(charge => charge.status === 'failed');
  
  // Calculate totals
  const totalRevenue = successfulCharges.reduce((sum, charge) => sum + charge.amount, 0);
  const totalFees = successfulCharges.reduce((sum, charge) => sum + (charge.application_fee_amount || 0), 0);
  const stripeFees = successfulCharges.reduce((sum, charge) => {
    // Estimate Stripe fees (2.9% + 30 cents for European cards)
    return sum + Math.round(charge.amount * 0.029) + 30;
  }, 0);
  
  const netRevenue = totalRevenue - stripeFees;
  const totalPayments = successfulCharges.length;
  const averageOrderValue = totalPayments > 0 ? totalRevenue / totalPayments : 0;

  // Group by payment type based on metadata
  const revenueByType = {};
  successfulCharges.forEach(charge => {
    const paymentIntent = paymentIntents.find(pi => pi.latest_charge === charge.id);
    const type = paymentIntent?.metadata?.type || 'unknown';
    
    if (!revenueByType[type]) {
      revenueByType[type] = { amount: 0, count: 0 };
    }
    
    revenueByType[type].amount += charge.amount;
    revenueByType[type].count++;
  });

  // Convert to percentage
  Object.keys(revenueByType).forEach(type => {
    revenueByType[type].amount = revenueByType[type].amount / 100;
    revenueByType[type].percentage = ((revenueByType[type].amount * 100) / (totalRevenue / 100) * 100).toFixed(2);
  });

  // Group data by time period
  const timeSeriesData = groupChargesByPeriod(successfulCharges, groupBy);

  // Get top customers
  const topCustomers = getTopCustomersFromCharges(successfulCharges, customerData);

  // Calculate growth metrics
  const growthMetrics = calculateGrowthMetricsFromCharges(successfulCharges);

  return {
    totalPayments,
    totalRevenue,
    netRevenue,
    totalFees: stripeFees,
    averageOrderValue,
    revenueByType,
    timeSeriesData,
    topCustomers,
    growthMetrics,
    successfulCharges: successfulCharges.length,
    failedCharges: failedCharges.length,
    refunds: refunds.length,
    disputes: charges.filter(c => c.dispute).length
  };
}

// Group charges by time period
function groupChargesByPeriod(charges, groupBy) {
  const grouped = {};
  
  charges.forEach(charge => {
    const date = new Date(charge.created * 1000);
    let periodKey;
    
    switch (groupBy) {
      case 'daily':
        periodKey = date.toISOString().substring(0, 10); // YYYY-MM-DD
        break;
      case 'weekly':
        const startOfWeek = new Date(date);
        startOfWeek.setDate(date.getDate() - date.getDay());
        periodKey = startOfWeek.toISOString().substring(0, 10);
        break;
      case 'monthly':
        periodKey = date.toISOString().substring(0, 7); // YYYY-MM
        break;
      case 'yearly':
        periodKey = date.getFullYear().toString();
        break;
      default:
        periodKey = 'all';
    }
    
    if (!grouped[periodKey]) {
      grouped[periodKey] = { revenue: 0, count: 0 };
    }
    
    grouped[periodKey].revenue += charge.amount;
    grouped[periodKey].count++;
  });
  
  // Convert to array and add average order value
  return Object.entries(grouped).map(([period, data]) => ({
    period,
    revenue: data.revenue / 100,
    count: data.count,
    averageOrderValue: data.count > 0 ? (data.revenue / data.count) / 100 : 0
  })).sort((a, b) => a.period.localeCompare(b.period));
}

// Get top customers from charges
function getTopCustomersFromCharges(charges, customers, limit = 10) {
  const customerMap = {};
  
  charges.forEach(charge => {
    const customerId = charge.customer;
    if (!customerId) return;
    
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    
    if (!customerMap[customerId]) {
      customerMap[customerId] = {
        userId: customerId,
        name: customer.name || 'Unknown',
        email: customer.email || 'Unknown',
        totalSpent: 0,
        totalOrders: 0,
        firstPurchase: new Date(charge.created * 1000),
        lastPurchase: new Date(charge.created * 1000)
      };
    }
    
    customerMap[customerId].totalSpent += charge.amount;
    customerMap[customerId].totalOrders++;
    
    const chargeDate = new Date(charge.created * 1000);
    if (chargeDate < customerMap[customerId].firstPurchase) {
      customerMap[customerId].firstPurchase = chargeDate;
    }
    
    if (chargeDate > customerMap[customerId].lastPurchase) {
      customerMap[customerId].lastPurchase = chargeDate;
    }
  });
  
  return Object.values(customerMap)
    .map(customer => ({
      ...customer,
      totalSpent: customer.totalSpent / 100
    }))
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, limit);
}

// Calculate growth metrics from charges
function calculateGrowthMetricsFromCharges(charges) {
  if (charges.length === 0) {
    return {
      revenueGrowth: 0,
      orderGrowth: 0,
      previousPeriodRevenue: 0,
      currentPeriodRevenue: 0,
      previousPeriodOrders: 0,
      currentPeriodOrders: 0
    };
  }
  
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  
  const currentPeriodCharges = charges.filter(c => new Date(c.created * 1000) >= thirtyDaysAgo);
  const previousPeriodCharges = charges.filter(c => {
    const chargeDate = new Date(c.created * 1000);
    return chargeDate >= sixtyDaysAgo && chargeDate < thirtyDaysAgo;
  });
  
  const currentPeriodRevenue = currentPeriodCharges.reduce((sum, c) => sum + c.amount, 0);
  const previousPeriodRevenue = previousPeriodCharges.reduce((sum, c) => sum + c.amount, 0);
  
  const revenueGrowth = previousPeriodRevenue > 0 
    ? ((currentPeriodRevenue - previousPeriodRevenue) / previousPeriodRevenue) * 100
    : 0;
  
  const orderGrowth = previousPeriodCharges.length > 0
    ? ((currentPeriodCharges.length - previousPeriodCharges.length) / previousPeriodCharges.length) * 100
    : 0;
  
  return {
    revenueGrowth: revenueGrowth / 100,
    orderGrowth,
    previousPeriodRevenue: previousPeriodRevenue / 100,
    currentPeriodRevenue: currentPeriodRevenue / 100,
    previousPeriodOrders: previousPeriodCharges.length,
    currentPeriodOrders: currentPeriodCharges.length
  };
}

// Get Stripe balance and payout information
exports.getStripeBalanceInfo = async function () {
  try {
    const balance = await stripe.balance.retrieve();
    
    // Get recent payouts
    const payouts = await stripe.payouts.list({ limit: 10 });
    
    return {
      available: balance.available.map(b => ({
        amount: b.amount / 100,
        currency: b.currency.toUpperCase()
      })),
      pending: balance.pending.map(b => ({
        amount: b.amount / 100,
        currency: b.currency.toUpperCase()
      })),
      recentPayouts: payouts.data.map(payout => ({
        id: payout.id,
        amount: payout.amount / 100,
        currency: payout.currency.toUpperCase(),
        status: payout.status,
        arrivalDate: new Date(payout.arrival_date * 1000),
        created: new Date(payout.created * 1000)
      }))
    };
  } catch (error) {
    console.error('Error getting Stripe balance info:', error);
    throw error;
  }
};

// Get Stripe transaction fees
exports.getStripeFeeAnalytics = async function (startDate, endDate) {
  try {
    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const endTimestamp = Math.floor(endDate.getTime() / 1000);
    
    // Get balance transactions which include fees
    const balanceTransactions = await stripe.balanceTransactions.list({
      created: {
        gte: startTimestamp,
        lte: endTimestamp
      },
      limit: 100
    });
    
    const feeAnalytics = {
      totalFees: 0,
      stripeFees: 0,
      applicationFees: 0,
      transactionCount: 0
    };
    
    balanceTransactions.data.forEach(transaction => {
      if (transaction.type === 'charge') {
        feeAnalytics.totalFees += transaction.fee;
        feeAnalytics.transactionCount++;
        
        transaction.fee_details.forEach(fee => {
          if (fee.type === 'stripe_fee') {
            feeAnalytics.stripeFees += fee.amount;
          } else if (fee.type === 'application_fee') {
            feeAnalytics.applicationFees += fee.amount;
          }
        });
      }
    });
    
    return {
      totalFees: feeAnalytics.totalFees / 100,
      stripeFees: feeAnalytics.stripeFees / 100,
      applicationFees: feeAnalytics.applicationFees / 100,
      transactionCount: feeAnalytics.transactionCount,
      averageFeePerTransaction: feeAnalytics.transactionCount > 0 
        ? (feeAnalytics.totalFees / feeAnalytics.transactionCount) / 100 
        : 0
    };
  } catch (error) {
    console.error('Error getting Stripe fee analytics:', error);
    throw error;
  }
};

// Unified direct payment processing
exports.processDirectPayment = async function ({ userId, tripId, albumId, amount }) {
  try {
    // Validate trip and album access
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

    // Check if HD album already purchased
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

    // Create payment intent with automatic payment methods
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: CURRENCY,
      automatic_payment_methods: { enabled: true },
      confirm: true, // Confirm immediately
      return_url: `${process.env.FRONTEND_URL}/payment/success`,
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

    // Check payment status
    if (paymentIntent.status !== 'succeeded') {
      throw new Error(`Payment failed: ${paymentIntent.last_payment_error?.message || 'Unknown error'}`);
    }

    // Process payment success immediately
    const result = await this.handleDirectPaymentSuccess(paymentIntent, amount);

    return {
      success: true,
      paymentId: result.paymentId,
      hdPdfUrl: result.hdPdfUrl,
      amount: amount,
      currency: CURRENCY,
      message: 'HD album unlocked for all trip members'
    };

  } catch (error) {
    console.error('Error processing direct payment:', error);
    throw error;
  }
};

// Handle direct payment success (immediate processing)
exports.handleDirectPaymentSuccess = async function (paymentIntent, amount) {
  try {
    const { userId, tripId, albumId } = paymentIntent.metadata;

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        userId,
        tripId,
        type: 'album_hd',
        amount: amount,
        currency: CURRENCY,
        status: 'completed',
        stripePaymentIntentId: paymentIntent.id
      }
    });

    // Generate HD album immediately
    const albumService = require('./album.service');
    const hdPdfUrl = await albumService.generateHDVersion(albumId);

    // Get trip details for notifications
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { members: true, tripAliases: true }
    });

    const purchaser = await prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true }
    });

    // Send notifications to all trip members
    const notificationService = require('./notification.service');
    const notificationPromises = trip.members.map(async (member) => {
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
    });

    // Send notifications in parallel
    await Promise.all(notificationPromises);

    console.log(`✅ Direct HD album payment successful for trip ${trip.name}`);

    return {
      paymentId: payment.id,
      hdPdfUrl,
      success: true
    };
  } catch (error) {
    console.error('Error handling direct payment success:', error);
    throw error;
  }
};

// Check if HD album is available for trip (accessible to all trip members)
exports.checkHDAvailability = async function (userId, tripId) {
  try {
    // Check if user is a member of the trip
    const trip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        members: { some: { id: userId } }
      },
      include: {
        album: true
      }
    });

    if (!trip) {
      throw new Error('Trip not found or access denied');
    }

    if (!trip.album) {
      return {
        available: false,
        message: 'Album is being generated...',
        canPurchase: false
      };
    }

    // Check if HD album has been purchased for this trip
    const hdPayment = await prisma.payment.findFirst({
      where: {
        tripId: tripId,
        type: 'album_hd',
        status: 'completed'
      }
    });

    const hasHDAccess = Boolean(hdPayment && trip.album.pdfHDUrl);

    return {
      available: hasHDAccess,
      albumId: trip.album.id,
      hdPdfUrl: hasHDAccess ? trip.album.pdfHDUrl : null,
      canPurchase: !hasHDAccess,
      hdPrice: 2.99,
      currency: 'EUR',
      message: hasHDAccess 
        ? 'HD album is available for all trip members' 
        : 'HD album not yet purchased for this trip'
    };
  } catch (error) {
    console.error('Error checking HD availability:', error);
    throw error;
  }
};