const nodemailer = require('nodemailer');

// Create transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // your gmail
    pass: process.env.EMAIL_PASS  // app password
  }
});

// Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP email
const sendOTPEmail = async (email, otp) => {
  const mailOptions = {
    from: {
      name: 'Secret Trip',
      address: process.env.EMAIL_USER
    },
    to: email,
    subject: 'Verify Your Email - Secret Trip',
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

  await transporter.sendMail(mailOptions);
};

// Send password reset email
const sendPasswordResetEmail = async (email, resetToken) => {
  const resetLink = `${process.env.FRONTEND_URL}?token=${resetToken}`;
  
  const mailOptions = {
    from: {
      name: 'Secret Trip',
      address: process.env.EMAIL_USER
    },
    to: email,
    subject: 'Reset Your Password - Secret Trip',
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

  await transporter.sendMail(mailOptions);
};

module.exports = {
  generateOTP,
  sendOTPEmail,
  sendPasswordResetEmail
};