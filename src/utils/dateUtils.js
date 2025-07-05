// src/utils/dateUtils.js - Enhanced date handling utilities
const moment = require('moment-timezone');

/**
 * Calculate number of days between start and end date (inclusive)
 * This fixes the original tripDurationDays function
 */
function tripDurationDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Normalize to start of day to avoid time zone issues
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  
  const diffTime = endDay.getTime() - startDay.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end day
  
  return Math.max(1, diffDays);
}

/**
 * Check if a trip should be activated based on current date and trip start date
 */
function shouldActivateTrip(tripStartDate) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const tripStart = new Date(tripStartDate);
  const tripStartDay = new Date(tripStart.getFullYear(), tripStart.getMonth(), tripStart.getDate());
  
  return tripStartDay <= today;
}

/**
 * Check if a trip should be ended based on current date and trip end date
 */
function shouldEndTrip(tripEndDate) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const tripEnd = new Date(tripEndDate);
  const tripEndDay = new Date(tripEnd.getFullYear(), tripEnd.getMonth(), tripEnd.getDate());
  
  return tripEndDay < today; // Trip ends when the end day has passed
}

/**
 * Calculate which day of the trip it currently is (1-indexed)
 */
function getCurrentTripDay(tripStartDate) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const tripStart = new Date(tripStartDate);
  const tripStartDay = new Date(tripStart.getFullYear(), tripStart.getMonth(), tripStart.getDate());
  
  if (today < tripStartDay) {
    return 0; // Trip hasn't started yet
  }
  
  const diffTime = today.getTime() - tripStartDay.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Calculate expected number of missions for a user based on current trip day
 */
function getExpectedMissionCount(tripStartDate, tripEndDate, memberCount, currentDay = null) {
  if (currentDay === null) {
    currentDay = getCurrentTripDay(tripStartDate);
  }
  
  if (currentDay <= 0) {
    return 0; // Trip hasn't started
  }
  
  const duration = tripDurationDays(tripStartDate, tripEndDate);
  const N = memberCount;
  const D = duration;
  
  // Mission distribution algorithm from DEV FILE
  const X = (N * D < 40) ? 100 : 80; // Target photos
  const M = Math.ceil(X / N); // Total missions per user
  const m = Math.ceil(M / D); // Missions per user per day
  
  // Expected missions based on current day, capped at total missions per user
  return Math.min(currentDay * m, M);
}

/**
 * Format date for logging and display
 */
function formatDateForLog(date) {
  if (!date) return 'null';
  return new Date(date).toISOString().split('T')[0];
}

/**
 * Check if two dates are the same day (ignoring time)
 */
function isSameDay(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}

/**
 * Get the start of day for a given date
 */
function getStartOfDay(date) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Add days to a date
 */
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Validate trip dates
 */
function validateTripDates(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const now = new Date();
  
  const errors = [];
  
  if (start >= end) {
    errors.push('Start date must be before end date');
  }
  
  if (end < now) {
    errors.push('End date cannot be in the past');
  }
  
  const duration = tripDurationDays(startDate, endDate);
  if (duration > 365) {
    errors.push('Trip duration cannot exceed 365 days');
  }
  
  if (duration < 1) {
    errors.push('Trip must be at least 1 day long');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    duration
  };
}

/**
 * Get timezone-safe date string for database storage
 */
function toDateString(date) {
  return new Date(date).toISOString().split('T')[0];
}

function formatDate(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(date));
}
module.exports = {
  tripDurationDays,
  shouldActivateTrip,
  shouldEndTrip,
  getCurrentTripDay,
  getExpectedMissionCount,
  formatDateForLog,
  isSameDay,
  getStartOfDay,
  addDays,
  validateTripDates,
  toDateString,
  formatDate
};