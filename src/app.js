const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const routes = require('./routes');
const session = require('express-session');
const passport = require('passport');
const errorHandler = require('./middlewares/errorHandler');
const { pinoLogger } = require('./config/logger');
const { prisma, connectDB } = require('./config/prisma'); 
require('./config/passport');
dotenv.config();

const app = express();

// CORS configuration
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5174',
  'http://localhost:65028',
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));


// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files serving - IMPORTANT: Add this for file uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: true,
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Health Check
app.get('/', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`; 
    res.status(200).json({
      success: true,
      message: 'Server is running and database is connected',
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Server is running but database connection failed',
      error: err.message,
    });
  }
});

// API routes
app.use('/api', routes);

// Error handling middleware
app.use(errorHandler);

// Database connection and server start
connectDB().then(() => {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    pinoLogger.info(`🚀 Server started on port ${PORT}`);
    pinoLogger.info(`📁 Static files served from: ${path.join(__dirname, 'uploads')}`);
  });
});