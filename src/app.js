const express = require('express');
const dotenv = require('dotenv');
const routes = require('./routes');
const session = require('express-session');
const passport = require('passport');
const errorHandler = require('./middlewares/errorHandler');
const { pinoLogger } = require('./config/logger');
const { prisma, connectDB } = require('./config/prisma'); 
require('./config/passport');
dotenv.config();

const app = express();
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: true,
}));

app.use(passport.initialize());
app.use(passport.session());
// Health Check Route EndPoint
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

// Routes
app.use('/api', routes);

// Error Handler
app.use(errorHandler);

// Connect DB first, then start server
connectDB().then(() => {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    pinoLogger.info(`🚀 Server started on port ${PORT}`);
  });
});
