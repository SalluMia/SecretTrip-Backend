const { prisma } = require('../config/prisma');
const fs = require('fs');
const path = require('path');

const AVAILABLE_INTERESTS = [
  'Adventure',
  'Historical Sites',
  'City Streets',
  'Nature & Outdoors',
  'Cultural Experiences',
  'Beach Escapes',
  'Food & Cuisine',
  'Wildlife & Safari',
  'Art & Architecture',
  'Nightlife & Parties',
  'Trekking',
  'Road Trips',
  'Local Experiences',
  'Photography',
  'Music & Festivals',
  'Water Sports',
  'Spiritual'
];

// Complete user profile
exports.completeProfile = async ({ userId, travelInterests, profilePhotoPath }) => {
  // Validate travel interests
  if (!travelInterests || !Array.isArray(travelInterests) || travelInterests.length === 0) {
    throw new Error('Please select at least one travel interest');
  }

  if (travelInterests.length > 5) {
    throw new Error('Maximum 5 travel interests allowed');
  }

  // Validate interests against available options
  const invalidInterests = travelInterests.filter(interest => !AVAILABLE_INTERESTS.includes(interest));
  if (invalidInterests.length > 0) {
    throw new Error(`Invalid travel interests: ${invalidInterests.join(', ')}`);
  }

  // Check if user exists
  const existingUser = await prisma.user.findUnique({ 
    where: { id: userId },
    select: { id: true, profilePhotoUrl: true, isProfileCompleted: true }
  });

  if (!existingUser) {
    throw new Error('User not found');
  }

  // If user already has a profile photo and a new one is uploaded, delete the old one
  if (existingUser.profilePhotoUrl && profilePhotoPath) {
    const oldPhotoPath = path.join(__dirname, '../uploads/profile-photos', path.basename(existingUser.profilePhotoUrl));
    if (fs.existsSync(oldPhotoPath)) {
      try {
        fs.unlinkSync(oldPhotoPath);
      } catch (error) {
        console.error('Error deleting old profile photo:', error);
      }
    }
  }

  // Prepare update data
  const updateData = {
    travelInterests,
    isProfileCompleted: true
  };

  // Add profile photo URL if uploaded
  if (profilePhotoPath) {
    updateData.profilePhotoUrl = `/uploads/profile-photos/${path.basename(profilePhotoPath)}`;
  }

  // Update user profile
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true,
      email: true,
      displayName: true,
      profilePhotoUrl: true,
      travelInterests: true,
      isProfileCompleted: true,
      role: true
    }
  });

  return {
    user: updatedUser,
    message: 'Profile completed successfully'
  };
};

// Get user profile
exports.getUserProfile = async ({ userId }) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      profilePhotoUrl: true,
      travelInterests: true,
      isProfileCompleted: true,
      role: true,
      createdAt: true
    }
  });

  if (!user) {
    throw new Error('User not found');
  }

  return { user };
};

// Update user profile (for updating profile after completion)
exports.updateProfile = async ({ userId, displayName, travelInterests, profilePhotoPath }) => {
  const existingUser = await prisma.user.findUnique({ 
    where: { id: userId },
    select: { id: true, profilePhotoUrl: true }
  });

  if (!existingUser) {
    throw new Error('User not found');
  }

  // Prepare update data
  const updateData = {};

  if (displayName) {
    updateData.displayName = displayName;
  }

  if (travelInterests) {
    if (!Array.isArray(travelInterests) || travelInterests.length === 0) {
      throw new Error('Please select at least one travel interest');
    }

    if (travelInterests.length > 5) {
      throw new Error('Maximum 5 travel interests allowed');
    }

    const invalidInterests = travelInterests.filter(interest => !AVAILABLE_INTERESTS.includes(interest));
    if (invalidInterests.length > 0) {
      throw new Error(`Invalid travel interests: ${invalidInterests.join(', ')}`);
    }

    updateData.travelInterests = travelInterests;
  }

  // Handle profile photo update
  if (profilePhotoPath) {
    // Delete old photo if exists
    if (existingUser.profilePhotoUrl) {
      const oldPhotoPath = path.join(__dirname, '../uploads/profile-photos', path.basename(existingUser.profilePhotoUrl));
      if (fs.existsSync(oldPhotoPath)) {
        try {
          fs.unlinkSync(oldPhotoPath);
        } catch (error) {
          console.error('Error deleting old profile photo:', error);
        }
      }
    }
    updateData.profilePhotoUrl = `/uploads/profile-photos/${path.basename(profilePhotoPath)}`;
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true,
      email: true,
      displayName: true,
      profilePhotoUrl: true,
      travelInterests: true,
      isProfileCompleted: true,
      role: true
    }
  });

  return {
    user: updatedUser,
    message: 'Profile updated successfully'
  };
};

// Get available travel interests
exports.getTravelInterests = async () => {
  return {
    interests: AVAILABLE_INTERESTS,
    maxSelection: 5
  };
};