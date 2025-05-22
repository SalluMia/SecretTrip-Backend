const authService = require('../services/auth.service');
const { successResponse, errorResponse } = require('../utils/response');

// Step 1: Signup
exports.signup = async (req, res, next) => {
  try {
    const { email, password, displayName } = req.body;

    // Validation
    if (!email || !password || !displayName) {
      return errorResponse(res, 400, 'Email, password, and display name are required');
    }

    if (password.length < 6) {
      return errorResponse(res, 400, 'Password must be at least 6 characters');
    }

    const data = await authService.signup({ email, password, displayName });
    successResponse(res, 201, 'Signup successful. Please check your email for verification code.', data);
  } catch (err) {
    next(err);
  }
};

// Step 2: Verify OTP
exports.verifyOTP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return errorResponse(res, 400, 'Email and OTP are required');
    }

    const data = await authService.verifyOTP({ email, otp });
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

// Login
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return errorResponse(res, 400, 'Email and password are required');
    }

    const data = await authService.login({ email, password });
    successResponse(res, 200, 'Login successful', data);
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