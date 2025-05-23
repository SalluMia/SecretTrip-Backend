const { prisma } = require('../config/prisma');
const bcrypt = require('bcryptjs');
const { generateOTP, sendOTPEmail, sendPasswordResetEmail } = require('../utils/email');
const crypto = require('crypto');
const { sign } = require('../utils/jwt');

// Step 1: Initial signup (creates user but unverified)
exports.signup = async ({ email, password, displayName }) => {
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
      isEmailVerified: false
    }
  });

  // Send OTP email
  await sendOTPEmail(email, otp);

  return { 
    message: 'Signup successful. Please check your email for verification code.',
    userId: user.id,
    email: user.email
  };
};

// Step 2: Verify OTP
exports.verifyOTP = async ({ email, otp }) => {
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

  // Update user as verified
  const updatedUser = await prisma.user.update({
    where: { email },
    data: { 
      isEmailVerified: true,
      emailVerificationToken: null
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      profilePhotoUrl: true,
      role: true
    }
  });

  const token = sign({ id: updatedUser.id });

  return { 
    user: updatedUser, 
    token,
    message: 'Email verified successfully'
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

// Login (only for verified users)
exports.login = async ({ email, password }) => {
  const user = await prisma.user.findUnique({ where: { email } });
  
  if (!user) {
    throw new Error('User not found');
  }

  if (!user.isEmailVerified) {
    throw new Error('Please verify your email first');
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    throw new Error('Invalid credentials');
  }

  const token = sign({ id: user.id });
  
  const userResponse = {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    profilePhotoUrl: user.profilePhotoUrl,
    role: user.role
  };

  return { user: userResponse, token };
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

// Verify reset token (optional - to check if token is valid before showing reset form)
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