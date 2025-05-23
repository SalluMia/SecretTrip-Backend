const { winstonLogger } = require('../config/logger');

module.exports = (err, req, res, next) => {
  winstonLogger.error(err.message, err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
};
