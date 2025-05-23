const { verify } = require('../utils/jwt'); // ✅ Use your wrapper
const { errorResponse } = require('../utils/response');
const status = require('../constants/statusCodes');

module.exports = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return errorResponse(res, status.UNAUTHORIZED, 'Token missing');

  try {
    const decoded = verify(token); // ✅ correct usage
    req.user = decoded;
    next();
  } catch (err) {
    console.error('JWT Error:', err.message);
    return errorResponse(res, status.UNAUTHORIZED, 'Invalid token');
  }
};
