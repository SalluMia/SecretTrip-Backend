const authService = require('../services/auth.service');
const { successResponse, errorResponse } = require('../utils/response');
const { prisma } = require('../config/prisma');

// Step 1: Signup (enhanced with FCM token support)
exports.signup = async (req, res, next) => {
  try {
    const { email, password, displayName, fcmToken } = req.body;

    // Validation
    if (!email || !password || !displayName) {
      return errorResponse(res, 400, 'Email, password, and display name are required');
    }

    if (password.length < 6) {
      return errorResponse(res, 400, 'Password must be at least 6 characters');
    }

    const data = await authService.signup({ 
      email, 
      password, 
      displayName, 
      fcmToken 
    });
    
    successResponse(res, 201, 'Signup successful. Please check your email for verification code.', data);
  } catch (err) {
    next(err);
  }
};

// Step 2: Verify OTP (enhanced with FCM token support)
exports.verifyOTP = async (req, res, next) => {
  try {
    const { email, otp, fcmToken } = req.body;

    if (!email || !otp) {
      return errorResponse(res, 400, 'Email and OTP are required');
    }

    const data = await authService.verifyOTP({ email, otp, fcmToken });
    successResponse(res, 200, 'Email verified successfully', data);
  } catch (err) {
    next(err);
  }
};

// Step 3: Resend OTP
exports.resendOTP = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return errorResponse(res, 400, 'Email is required');
    }

    const data = await authService.resendOTP({ email });
    successResponse(res, 200, 'New verification code sent to your email', data);
  } catch (err) {
    next(err);
  }
};

// Login (enhanced with FCM token support)
exports.login = async (req, res, next) => {
  try {
    const { email, password, fcmToken } = req.body;

    if (!email || !password) {
      return errorResponse(res, 400, 'Email and password are required');
    }

    const data = await authService.login({ email, password, fcmToken });
    
    // Include FCM token status in response
    const responseMessage = data.fcmTokenUpdated 
      ? 'Login successful with notifications enabled'
      : 'Login successful';

    successResponse(res, 200, responseMessage, data);
  } catch (err) {
    next(err);
  }
};

// Google OAuth (enhanced with FCM token support)
exports.googleOAuth = async (req, res, next) => {
  try {
    const { idToken, fcmToken } = req.body;

    if (!idToken) {
      return errorResponse(res, 400, 'Google ID token is required');
    }

    const data = await authService.googleOAuth({ idToken, fcmToken });
    
    const responseMessage = data.isNewUser 
      ? 'Google account created and logged in successfully'
      : 'Google login successful';

    successResponse(res, 200, responseMessage, data);
  } catch (err) {
    next(err);
  }
};

// Logout (enhanced with FCM token clearing)
exports.logout = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { clearFCMToken = true } = req.body;

    const data = await authService.logout({ userId, clearFCMToken });
    successResponse(res, 200, 'Logout successful', data);
  } catch (err) {
    next(err);
  }
};

// Update FCM Token (new endpoint)
exports.updateFCMToken = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { fcmToken } = req.body;

    if (!fcmToken) {
      return errorResponse(res, 400, 'FCM token is required');
    }

    const data = await authService.updateFCMToken({ userId, fcmToken });
    successResponse(res, 200, 'FCM token updated successfully', data);
  } catch (err) {
    next(err);
  }
};

// Remove FCM Token (new endpoint)
exports.removeFCMToken = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const data = await authService.removeFCMToken({ userId });
    successResponse(res, 200, 'FCM token removed successfully', data);
  } catch (err) {
    next(err);
  }
};

// Test FCM Token (new endpoint for testing notifications)
exports.testFCMToken = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fcmToken: true, displayName: true }
    });

    if (!user?.fcmToken) {
      return errorResponse(res, 400, 'No FCM token found for user');
    }

    // Send test notification
    try {
      const admin = require('firebase-admin');
      
      const testMessage = {
        token: user.fcmToken,
        notification: {
          title: '🧪 Test de notification',
          body: `Salut ${user.displayName} ! Tes notifications fonctionnent parfaitement !`
        },
        data: {
          type: 'TEST_NOTIFICATION',
          timestamp: new Date().toISOString()
        }
      };

      const result = await admin.messaging().send(testMessage);
      
      successResponse(res, 200, 'Test notification sent successfully', {
        messageId: result,
        sentTo: user.displayName,
        timestamp: new Date()
      });
    } catch (firebaseError) {
      console.error('Firebase test error:', firebaseError);
      return errorResponse(res, 500, 'Failed to send test notification');
    }
  } catch (err) {
    next(err);
  }
};

// Forgot Password
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return errorResponse(res, 400, 'Email is required');
    }

    const data = await authService.forgotPassword({ email });
    successResponse(res, 200, 'Password reset link sent to your email', data);
  } catch (err) {
    next(err);
  }
};

// Verify Reset Token
exports.verifyResetToken = async (req, res, next) => {
  try {
    const { token } = req.params;
    const data = await authService.verifyResetToken({ token });
    successResponse(res, 200, 'Token is valid', data);
  } catch (err) {
    next(err);
  }
};

// Reset Password
exports.resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return errorResponse(res, 400, 'Token and new password are required');
    }

    if (newPassword.length < 6) {
      return errorResponse(res, 400, 'Password must be at least 6 characters');
    }

    const data = await authService.resetPassword({ token, newPassword });
    successResponse(res, 200, 'Password reset successful', data);
  } catch (err) {
    next(err);
  }
};

// Delete user account
exports.deleteAccount = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const data = await authService.deleteAccount({ userId});
    successResponse(res, 200, 'Account deleted successfully', data);
  } catch (err) {
    next(err);
  }
};