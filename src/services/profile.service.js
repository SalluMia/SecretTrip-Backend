const { prisma } = require('../config/prisma');
const fs = require('fs');
const path = require('path');
const scalewayStorage = require('./scalewayStorage.service');

// Helper function to ensure URLs are accessible (simplified for public bucket)
async function ensureAccessibleUrl(url) {
  if (!url) return null;
  
  // For public bucket, URLs are directly accessible
  return url;
}

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

  // Note: Old profile photo deletion is now handled in the middleware

  const updateData = {
    isProfileCompleted: true,
    interests: {
      set: travelInterests.map(id => ({ id })) // ✅ link to dynamic table
    }
  };

  if (profilePhotoPath) {
    // Check if it's already a Scaleway URL or a local file path
    if (profilePhotoPath.startsWith('http') && profilePhotoPath.includes('scw.cloud')) {
      // Already uploaded to Scaleway by middleware, use the URL directly
      updateData.profilePhotoUrl = profilePhotoPath;
      console.log('✅ Using Scaleway URL from middleware for profile photo');
    } else {
      // This is a local file path (legacy fallback)
      // Upload new profile photo to Scaleway with consistent filename
      try {
        const uploadResult = await scalewayStorage.uploadLocalFile(
          profilePhotoPath,
          'profile-photos',
          `profile_${userId}.jpg`
        );
        updateData.profilePhotoUrl = uploadResult.url;
        console.log('✅ Profile photo uploaded to Scaleway with consistent filename');
      } catch (error) {
        console.error('Error uploading profile photo to Scaleway:', error);
        throw new Error('Failed to upload profile photo');
      }
    }
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

  // Ensure profile photo URL is accessible
  if (user.profilePhotoUrl) {
    user.profilePhotoUrl = await ensureAccessibleUrl(user.profilePhotoUrl);
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
    // Check if it's already a Scaleway URL or a local file path
    if (profilePhotoPath.startsWith('http') && profilePhotoPath.includes('scw.cloud')) {
      // Already uploaded to Scaleway by middleware, use the URL directly
      updateData.profilePhotoUrl = profilePhotoPath;
      console.log('✅ Using Scaleway URL from middleware for profile photo');
    } else {
      // This is a local file path (legacy fallback)
      // Upload new profile photo to Scaleway with consistent filename
      try {
        const uploadResult = await scalewayStorage.uploadLocalFile(
          profilePhotoPath,
          'profile-photos',
          `profile_${userId}.jpg`
        );
        updateData.profilePhotoUrl = uploadResult.url;
        console.log('✅ Profile photo uploaded to Scaleway with consistent filename');
      } catch (error) {
        console.error('Error uploading profile photo to Scaleway:', error);
        throw new Error('Failed to upload profile photo');
      }
    }
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

  // Ensure profile photo URL is accessible
  if (updatedUser.profilePhotoUrl) {
    updatedUser.profilePhotoUrl = await ensureAccessibleUrl(updatedUser.profilePhotoUrl);
  }

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

// Clean up orphaned profile photos (utility function)
exports.cleanupOrphanedPhotos = async () => {
  try {
    console.log('🧹 Starting cleanup of orphaned profile photos...');
    
    // Get all users with profile photos
    const users = await prisma.user.findMany({
      where: {
        profilePhotoUrl: { not: null }
      },
      select: {
        id: true,
        profilePhotoUrl: true
      }
    });
    
    console.log(`📊 Found ${users.length} users with profile photos`);
    
    // Get all files in the profile-photos folder
    const { S3Client, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
    
    const s3Client = new S3Client({
      region: process.env.SCALEWAY_REGION || 'nl-ams',
      endpoint: `https://s3.${process.env.SCALEWAY_REGION || 'nl-ams'}.scw.cloud`,
      credentials: {
        accessKeyId: process.env.SCALEWAY_ACCESS_KEY_ID,
        secretAccessKey: process.env.SCALEWAY_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true,
    });
    
    const listCommand = new ListObjectsV2Command({
      Bucket: process.env.SCALEWAY_BUCKET_NAME || 'secret-trip-storage',
      Prefix: 'profile-photos/'
    });
    
    const response = await s3Client.send(listCommand);
    const files = response.Contents || [];
    
    console.log(`📁 Found ${files.length} files in profile-photos folder`);
    
    // Create a set of active photo URLs
    const activePhotoKeys = new Set();
    users.forEach(user => {
      if (user.profilePhotoUrl) {
        const key = scalewayStorage.extractKeyFromUrl(user.profilePhotoUrl);
        if (key) {
          activePhotoKeys.add(key);
        }
      }
    });
    
    console.log(`✅ Found ${activePhotoKeys.size} active profile photos`);
    
    // Delete orphaned files
    let deletedCount = 0;
    for (const file of files) {
      if (!activePhotoKeys.has(file.Key)) {
        try {
          const deleteCommand = new DeleteObjectCommand({
            Bucket: process.env.SCALEWAY_BUCKET_NAME || 'secret-trip-storage',
            Key: file.Key
          });
          
          await s3Client.send(deleteCommand);
          console.log(`🗑️ Deleted orphaned file: ${file.Key}`);
          deletedCount++;
        } catch (error) {
          console.error(`❌ Error deleting ${file.Key}:`, error.message);
        }
      }
    }
    
    console.log(`🎉 Cleanup complete! Deleted ${deletedCount} orphaned files`);
    return { deletedCount, totalFiles: files.length, activePhotos: activePhotoKeys.size };
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  }
};