const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Optional: Ping DB on startup to verify connection
async function connectDB() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected');
  } catch (error) {
    console.error('❌ Failed to connect to database:', error.message);
    process.exit(1); // Exit the app if DB connection fails
  }
}

module.exports = { prisma, connectDB };
