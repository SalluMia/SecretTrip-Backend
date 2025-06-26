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
const { startScheduledJobs } = require('./jobs/scheduler'); 
require('./config/passport');

dotenv.config();

const app = express();

// ✅ Allowed origins list
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5174',
  'http://localhost:65028',
];

// ✅ CORS setup
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) {
      // Allow requests like Postman or curl
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Optional wildcard fallback (no credentials in this case)
    if (origin === '*') {
      return callback(null, true);
    }

    console.warn(`❌ CORS blocked origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  exposedHeaders: ['Content-Disposition'], // for file downloads
};

app.use(cors(corsOptions));

// ✅ Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Static file serving for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ Session setup
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: true,
}));

// ✅ Passport setup
app.use(passport.initialize());
app.use(passport.session());

// ✅ Health check
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

// ✅ API routes
app.use('/api', routes);

// ✅ Error handling middleware
app.use(errorHandler);

// ✅ DB connect + server start
connectDB().then(() => {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    pinoLogger.info(`🚀 Server started on port ${PORT}`);
    pinoLogger.info(`📁 Static files served from: ${path.join(__dirname, 'uploads')}`);

    // START MISSION SCHEDULER - ADD THESE LINES
    startScheduledJobs();
    pinoLogger.info(`⏰ Mission scheduler started`);
  });
});
