const { getHomeData } = require('../services/home.service');
const { successResponse, errorResponse } = require('../utils/response');

exports.getHome = async (req, res, next) => {
  try {
    const data = await getHomeData(req.user.id);
    successResponse(res, 200, 'Home data', data);
  } catch (err) {
    next(err);
  }
};
