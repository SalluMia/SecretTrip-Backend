const nodemailer = require('nodemailer');

// Create transporter with Hostinger SMTP settings
const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER, // your hostinger email
    pass: process.env.EMAIL_PASS  // your hostinger email password
  },
  // Optimize for faster delivery
  pool: true, // Use pooled connections
  maxConnections: 5, // Limit concurrent connections
  maxMessages: 100, // Max messages per connection
  rateLimit: 5, // Max messages per second
  // Connection timeout settings
  connectionTimeout: 10000, // 10 seconds
  greetingTimeout: 5000, // 5 seconds
  socketTimeout: 10000, // 10 seconds
  // TLS settings for better delivery
  tls: {
    rejectUnauthorized: false
  }
});

// Verify transporter connection on startup
transporter.verify(function(error, success) {
  if (error) {
    console.error('❌ Email transporter verification failed:', error);
  } else {
    console.log('✅ Email transporter is ready to send messages');
  }
});

// Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP email - Optimized for faster delivery
const sendOTPEmail = async (email, otp) => {
  try {
    const mailOptions = {
      from: {
        name: 'Secret Trip',
        address: process.env.EMAIL_USER
      },
      to: email,
      subject: 'Verify Your Email - Secret Trip',
      priority: 'high', // Add high priority for verification emails
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0;">Secret Trip</h1>
          </div>
          <div style="padding: 30px; background-color: #f9f9f9;">
            <h2 style="color: #333;">Verify Your Email</h2>
            <p style="color: #555; font-size: 16px;">Welcome to Secret Trip! Please use the following OTP to verify your email address:</p>
            <div style="background: #fff; padding: 20px; border-radius: 10px; text-align: center; margin: 20px 0;">
              <h1 style="color: #667eea; font-size: 32px; margin: 0; letter-spacing: 3px;">${otp}</h1>
            </div>
            <p style="color: #555;">This OTP will expire in 10 minutes.</p>
            <p style="color: #888; font-size: 14px;">If you didn't request this, please ignore this email.</p>
          </div>
          <div style="background: #333; padding: 20px; text-align: center;">
            <p style="color: #fff; margin: 0; font-size: 14px;">© 2024 Secret Trip. All rights reserved.</p>
          </div>
        </div>
      `
    };

    // Add timeout and better error handling
    const result = await Promise.race([
      transporter.sendMail(mailOptions),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Email sending timeout')), 10000)
      )
    ]);

    console.log(`✅ OTP email sent successfully to ${email}`);
    return result;
  } catch (error) {
    console.error(`❌ Failed to send OTP email to ${email}:`, error);
    throw new Error(`Failed to send OTP email: ${error.message}`);
  }
};

// Send password reset email - Optimized for faster delivery
const sendPasswordResetEmail = async (email, resetToken) => {
  try {
    const resetLink = `${process.env.FRONTEND_URL}?token=${resetToken}`;
    
    const mailOptions = {
      from: {
        name: 'Secret Trip',
        address: process.env.EMAIL_USER
      },
      to: email,
      subject: 'Reset Your Password - Secret Trip',
      priority: 'high', // Add high priority for password reset emails
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0;">Secret Trip</h1>
          </div>
          <div style="padding: 30px; background-color: #f9f9f9;">
            <h2 style="color: #333;">Reset Your Password</h2>
            <p style="color: #555; font-size: 16px;">You requested to reset your password. Click the button below to reset it:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block;">Reset Password</a>
            </div>
            <p style="color: #555;">Or copy and paste this link into your browser:</p>
            <p style="color: #667eea; word-break: break-all;">${resetLink}</p>
            <p style="color: #555;">This link will expire in 1 hour.</p>
            <p style="color: #888; font-size: 14px;">If you didn't request this, please ignore this email.</p>
          </div>
          <div style="background: #333; padding: 20px; text-align: center;">
            <p style="color: #fff; margin: 0; font-size: 14px;">© 2024 Secret Trip. All rights reserved.</p>
          </div>
        </div>
      `
    };

    // Add timeout and better error handling
    const result = await Promise.race([
      transporter.sendMail(mailOptions),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Email sending timeout')), 10000)
      )
    ]);

    console.log(`✅ Password reset email sent successfully to ${email}`);
    return result;
  } catch (error) {
    console.error(`❌ Failed to send password reset email to ${email}:`, error);
    throw new Error(`Failed to send password reset email: ${error.message}`);
  }
};

module.exports = {
  generateOTP,
  sendOTPEmail,
  sendPasswordResetEmail
};