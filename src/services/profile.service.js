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
  if (!Array.isArray(travelInterests) || travelInterests.length === 0) {
    throw new Error('Please select at least one travel interest');
  }

  if (travelInterests.length > 5) {
    throw new Error('Maximum 5 travel interests allowed');
  }

  // Validate IDs from DB
  const interests = await prisma.travelInterest.findMany({
    where: { id: { in: travelInterests } }
  });

  if (interests.length !== travelInterests.length) {
    throw new Error('One or more selected interests are invalid');
  }

  // Optional: delete old profile photo
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { profilePhotoUrl: true }
  });

  if (existingUser?.profilePhotoUrl && profilePhotoPath) {
    const oldPath = path.join(__dirname, '../uploads/profile-photos', path.basename(existingUser.profilePhotoUrl));
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  const updateData = {
    isProfileCompleted: true,
    interests: {
      set: travelInterests.map(id => ({ id })) // ✅ link to dynamic table
    }
  };

  if (profilePhotoPath) {
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
      isProfileCompleted: true,
      role: true,
      interests: true
    }
  });

  return { user: updatedUser, message: 'Profile completed successfully' };
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
    isProfileCompleted: true,
    role: true,
    createdAt: true,
    interests: {
      select: { id: true, name: true }
    }
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
    select: { id: true, profilePhotoUrl: true, displayName: true }
  });

  if (!existingUser) {
    throw new Error('User not found');
  }

  const updateData = {};

  // ✅ Handle displayName update with validation
  if (displayName !== undefined) {
    if (typeof displayName !== 'string') {
      throw new Error('Display name must be a string');
    }
    
    const trimmedDisplayName = displayName.trim();
    
    if (trimmedDisplayName.length === 0) {
      throw new Error('Display name cannot be empty');
    }
    
    if (trimmedDisplayName.length > 50) {
      throw new Error('Display name cannot exceed 50 characters');
    }
    
    updateData.displayName = trimmedDisplayName;
  }

  // ✅ Handle dynamic interests
  if (travelInterests !== undefined) {
    if (!Array.isArray(travelInterests)) {
      throw new Error('Travel interests must be an array');
    }
    
    if (travelInterests.length === 0) {
      throw new Error('Please select at least one travel interest');
    }

    if (travelInterests.length > 5) {
      throw new Error('Maximum 5 travel interests allowed');
    }

    const validInterests = await prisma.travelInterest.findMany({
      where: { id: { in: travelInterests } }
    });

    if (validInterests.length !== travelInterests.length) {
      throw new Error('One or more travel interests are invalid');
    }

    updateData.interests = {
      set: travelInterests.map(id => ({ id }))
    };
  }

  // ✅ Handle profile photo update
  if (profilePhotoPath) {
    if (existingUser.profilePhotoUrl) {
      const oldPath = path.join(__dirname, '../uploads/profile-photos', path.basename(existingUser.profilePhotoUrl));
      if (fs.existsSync(oldPath)) {
        try {
          fs.unlinkSync(oldPath);
        } catch (err) {
          console.error('Error deleting old photo:', err);
        }
      }
    }

    updateData.profilePhotoUrl = `/uploads/profile-photos/${path.basename(profilePhotoPath)}`;
  }

  // Only update if there's something to update
  if (Object.keys(updateData).length === 0) {
    throw new Error('No valid fields provided for update');
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true,
      email: true,
      displayName: true,
      profilePhotoUrl: true,
      isProfileCompleted: true,
      role: true,
      createdAt: true,
      interests: {
        select: { id: true, name: true }
      }
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