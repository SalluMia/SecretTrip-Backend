const { prisma } = require('../config/prisma');
const bcrypt = require('bcryptjs');
const { generateOTP, sendOTPEmail, sendPasswordResetEmail } = require('../utils/email');
const crypto = require('crypto');
const { sign } = require('../utils/jwt');

// FCM Token validation function
const validateFCMToken = async (fcmToken) => {
  try {
    // Only validate if Firebase Admin is available
    if (process.env.FIREBASE_PROJECT_ID) {
      const admin = require('firebase-admin');
      
      // Test if token is valid by creating a dry-run message
      const message = {
        token: fcmToken,
        notification: {
          title: 'Test',
          body: 'Test message'
        },
        dryRun: true // This won't actually send the notification
      };

      await admin.messaging().send(message);
    }
    return true;
  } catch (error) {
    console.error('FCM token validation failed:', error);
    return false;
  }
};

// Update FCM token for user
const updateUserFCMToken = async (userId, fcmToken) => {
  try {
    if (!fcmToken) return null;

    // Validate FCM token
    const isValidToken = await validateFCMToken(fcmToken);
    
    if (!isValidToken) {
      console.warn('Invalid FCM token provided, skipping update');
      return null;
    }

    // Check if token is already associated with another user
    const existingUser = await prisma.user.findFirst({
      where: {
        fcmToken: fcmToken,
        id: { not: userId }
      }
    });

    // If token exists for another user, remove it (user switched devices)
    if (existingUser) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { fcmToken: null }
      });
      console.log(`Removed FCM token from user ${existingUser.id} (device switched)`);
    }

    // Update user's FCM token
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { 
        fcmToken: fcmToken,
        lastActive: new Date()
      }
    });

    console.log(`FCM token updated for user ${userId}`);
    return updatedUser;
  } catch (error) {
    console.error('Error updating FCM token:', error);
    return null;
  }
};

// Step 1: Initial signup (creates user but unverified)
exports.signup = async ({ email, password, displayName, fcmToken = null }) => {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.isEmailVerified) {
      throw new Error('User already exists and is verified');
    }
    // Delete unverified user to allow re-signup
    await prisma.user.delete({ where: { id: existing.id } });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const otp = generateOTP();
  
  const user = await prisma.user.create({
    data: { 
      email, 
      password: hashedPassword, 
      displayName,  
      provider: 'email',
      emailVerificationToken: otp,
      isEmailVerified: false,
      fcmToken: fcmToken // Store FCM token during signup if provided
    }
  });

  // Send OTP email
  await sendOTPEmail(email, otp);

  return { 
    message: 'Signup successful. Please check your email for verification code.',
    userId: user.id,
    email: user.email,
    fcmTokenStored: !!fcmToken
  };
};

// Step 2: Verify OTP (enhanced with FCM token support)
exports.verifyOTP = async ({ email, otp, fcmToken = null }) => {
  const user = await prisma.user.findUnique({ where: { email } });
  
  if (!user) {
    throw new Error('User not found');
  }

  if (user.isEmailVerified) {
    throw new Error('Email already verified');
  }

  if (user.emailVerificationToken !== otp) {
    throw new Error('Invalid OTP');
  }

  // Update user as verified and FCM token if provided
  const updateData = { 
    isEmailVerified: true,
    emailVerificationToken: null,
    lastActive: new Date()
  };

  // Add FCM token if provided and different from existing
  if (fcmToken && fcmToken !== user.fcmToken) {
    const isValidToken = await validateFCMToken(fcmToken);
    if (isValidToken) {
      updateData.fcmToken = fcmToken;
    }
  }

  const updatedUser = await prisma.user.update({
    where: { email },
    data: updateData,
    select: {
      id: true,
      email: true,
      displayName: true,
      profilePhotoUrl: true,
      role: true,
      fcmToken: true
    }
  });

  const token = sign({ id: updatedUser.id });

  return { 
    user: {
      id: updatedUser.id,
      email: updatedUser.email,
      displayName: updatedUser.displayName,
      profilePhotoUrl: updatedUser.profilePhotoUrl,
      role: updatedUser.role
    }, 
    token,
    message: 'Email verified successfully',
    fcmTokenUpdated: !!fcmToken
  };
};

// Step 3: Resend OTP
exports.resendOTP = async ({ email }) => {
  const user = await prisma.user.findUnique({ where: { email } });
  
  if (!user) {
    throw new Error('User not found');
  }

  if (user.isEmailVerified) {
    throw new Error('Email already verified');
  }

  const newOTP = generateOTP();
  
  await prisma.user.update({
    where: { email },
    data: { emailVerificationToken: newOTP }
  });

  await sendOTPEmail(email, newOTP);

  return { message: 'New verification code sent to your email' };
};

// Enhanced Login with FCM token support
exports.login = async ({ email, password, fcmToken = null }) => {
  const user = await prisma.user.findUnique({ where: { email } });
  
  if (!user) {
    throw new Error('User not found');
  }

  if (user.status === 'BLOCKED') {
    throw new Error('Your account has been blocked by admin.');
  }

  if (!user.isEmailVerified) {
    throw new Error('Please verify your email first');
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    throw new Error('Invalid credentials');
  }

  // Update FCM token if provided
  let fcmTokenUpdated = false;
  if (fcmToken) {
    const result = await updateUserFCMToken(user.id, fcmToken);
    fcmTokenUpdated = !!result;
  }

  // Update last active regardless of FCM token update
  await prisma.user.update({
    where: { id: user.id },
    data: { lastActive: new Date() }
  });

  const token = sign({ id: user.id, role: user.role });
  
  const userResponse = {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    profilePhotoUrl: user.profilePhotoUrl,
    role: user.role,
    isProfileCompleted: user.isProfileCompleted
  };

  return { 
    user: userResponse, 
    token,
    fcmTokenUpdated
  };
};

// Google OAuth login with FCM token support
exports.googleOAuth = async ({ idToken, fcmToken = null }) => {
  try {
    // Verify Google ID token
    const admin = require('firebase-admin');
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid, email, name, picture } = decodedToken;

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { googleId: uid }
    });

    if (!user) {
      // Check if user exists with this email
      user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
      });

      if (user) {
        // Link Google account to existing user
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleId: uid }
        });
      } else {
        // Create new user
        user = await prisma.user.create({
          data: {
            email: email.toLowerCase(),
            displayName: name,
            profilePhotoUrl: picture,
            provider: 'GOOGLE',
            googleId: uid,
            isEmailVerified: true, // Google emails are pre-verified
            fcmToken: fcmToken // Store FCM token if provided
          }
        });
      }
    }

    if (user.status === 'BLOCKED') {
      throw new Error('Your account has been blocked');
    }

    // Update FCM token if provided and user already existed
    let fcmTokenUpdated = false;
    if (fcmToken && (!user.fcmToken || user.fcmToken !== fcmToken)) {
      const result = await updateUserFCMToken(user.id, fcmToken);
      fcmTokenUpdated = !!result;
    }

    // Update last active
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActive: new Date() }
    });

    // Generate JWT token
    const token = sign({ id: user.id, email: user.email });

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        profilePhotoUrl: user.profilePhotoUrl,
        role: user.role,
        isProfileCompleted: user.isProfileCompleted
      },
      token,
      isNewUser: !user.lastActive,
      fcmTokenUpdated
    };
  } catch (error) {
    console.error('Google OAuth error:', error);
    throw new Error('Google authentication failed');
  }
};

// Logout with FCM token removal
exports.logout = async ({ userId, clearFCMToken = true }) => {
  try {
    if (clearFCMToken) {
      await prisma.user.update({
        where: { id: userId },
        data: { fcmToken: null }
      });
      console.log(`FCM token cleared for user ${userId}`);
    }

    return { 
      message: 'Logout successful',
      fcmTokenCleared: clearFCMToken
    };
  } catch (error) {
    console.error('Error during logout:', error);
    throw new Error('Logout failed');
  }
};

// Update FCM Token (standalone function)
exports.updateFCMToken = async ({ userId, fcmToken }) => {
  try {
    if (!fcmToken) {
      throw new Error('FCM token is required');
    }

    const result = await updateUserFCMToken(userId, fcmToken);
    
    if (!result) {
      throw new Error('Failed to update FCM token');
    }

    return {
      message: 'FCM token updated successfully',
      userId: result.id,
      timestamp: new Date()
    };
  } catch (error) {
    console.error('Error updating FCM token:', error);
    throw error;
  }
};

// Remove FCM Token
exports.removeFCMToken = async ({ userId }) => {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { fcmToken: null }
    });

    return {
      message: 'FCM token removed successfully',
      userId
    };
  } catch (error) {
    console.error('Error removing FCM token:', error);
    throw error;
  }
};

// Forgot Password
exports.forgotPassword = async ({ email }) => {
  const user = await prisma.user.findUnique({ where: { email } });
  
  if (!user) {
    throw new Error('User not found');
  }

  if (!user.isEmailVerified) {
    throw new Error('Please verify your email first');
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetExpires = new Date(Date.now() + 3600000); // 1 hour

  await prisma.user.update({
    where: { email },
    data: {
      passwordResetToken: resetToken,
      passwordResetExpires: resetExpires
    }
  });

  await sendPasswordResetEmail(email, resetToken);

  return { message: 'Password reset link sent to your email' };
};

// Reset Password
exports.resetPassword = async ({ token, newPassword }) => {
  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: token,
      passwordResetExpires: {
        gt: new Date()
      }
    }
  });

  if (!user) {
    throw new Error('Invalid or expired reset token');
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetExpires: null
    }
  });

  return { message: 'Password reset successful' };
};

// Verify reset token
exports.verifyResetToken = async ({ token }) => {
  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: token,
      passwordResetExpires: {
        gt: new Date()
      }
    }
  });

  if (!user) {
    throw new Error('Invalid or expired reset token');
  }

  return { message: 'Token is valid', email: user.email };
};