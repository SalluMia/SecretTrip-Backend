// src/utils/helpers.js - Updated with fixed date calculations

// Shuffle an array randomly
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ✅ FIXED: Calculate number of days between start and end date (inclusive)
function tripDurationDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Normalize to start of day to avoid timezone issues
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  
  const diffTime = endDay.getTime() - startDay.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end day
  
  return Math.max(1, diffDays);
}

// ✅ NEW: Calculate current day of trip (1-indexed)
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

// ✅ NEW: Check if trip should be active based on dates
function shouldTripBeActive(startDate, endDate) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const start = new Date(startDate);
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  
  const end = new Date(endDate);
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  
  return today >= startDay && today <= endDay;
}

// ✅ NEW: Check if trip should be completed based on dates
function shouldTripBeCompleted(endDate) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const end = new Date(endDate);
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  
  return today > endDay;
}

// ✅ NEW: Calculate mission distribution according to DEV FILE algorithm
function calculateMissionDistribution(memberCount, durationDays) {
  const N = memberCount; // Number of participants
  const D = durationDays; // Duration in days
  
  // Algorithm from DEV FILE:
  // 1. Set base goal of 80-100 photos per trip
  // 2. If N × D < 40, then X = 100, else X = 80
  const X = (N * D < 40) ? 100 : 80; // Target number of photos
  
  // 3. M = ceil(X / N) → total missions per user
  const M = Math.ceil(X / N);
  
  // 4. m = ceil(M / D) → missions per user per day
  const m = Math.ceil(M / D);

  return {
    participantCount: N,
    durationDays: D,
    targetPhotos: X,
    missionsPerUser: M,
    missionsPerUserPerDay: m,
    totalMissions: N * M
  };
}

// ✅ NEW: Get expected mission count for user based on current trip day
function getExpectedMissionCount(startDate, memberCount, durationDays, currentDay = null) {
  if (currentDay === null) {
    currentDay = getCurrentTripDay(startDate);
  }
  
  if (currentDay <= 0) {
    return 0; // Trip hasn't started
  }
  
  const distribution = calculateMissionDistribution(memberCount, durationDays);
  
  // Expected missions based on current day, capped at total missions per user
  return Math.min(currentDay * distribution.missionsPerUserPerDay, distribution.missionsPerUser);
}

// ✅ NEW: Format date for consistent logging
function formatDateForLog(date) {
  if (!date) return 'null';
  return new Date(date).toISOString().split('T')[0];
}

// ✅ NEW: Validate if a date is today or in the past
function isDateTodayOrPast(date) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const checkDate = new Date(date);
  const checkDay = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate());
  
  return checkDay <= today;
}

// ✅ NEW: Get normalized date (start of day)
function getNormalizedDate(date) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

module.exports = {
  shuffleArray,
  tripDurationDays,
  getCurrentTripDay,
  shouldTripBeActive,
  shouldTripBeCompleted,
  calculateMissionDistribution,
  getExpectedMissionCount,
  formatDateForLog,
  isDateTodayOrPast,
  getNormalizedDate
};