const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const { errorResponse } = require('../utils/response');
const status = require('../constants/statusCodes');

module.exports = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) return errorResponse(res, status.UNAUTHORIZED, 'Token missing');

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return errorResponse(res, status.UNAUTHORIZED, 'Invalid token');
  }
};
