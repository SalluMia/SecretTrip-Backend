const authService = require('../services/auth.service');
const { successResponse, errorResponse } = require('../utils/response');

exports.signup = async (req, res, next) => {
  try {
    const data = await authService.signup(req.body);
    successResponse(res, 201, 'Signup successful', data);
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const data = await authService.login(req.body);
    successResponse(res, 200, 'Login successful', data);
  } catch (err) {
    next(err);
  }
};
