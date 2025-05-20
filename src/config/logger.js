const winston = require('winston');
const pino = require('pino');

const winstonLogger = winston.createLogger({
  transports: [new winston.transports.Console()]
});

const pinoLogger = pino({
  transport: { target: 'pino-pretty' }
});

module.exports = { winstonLogger, pinoLogger };
