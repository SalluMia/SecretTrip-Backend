const { errorResponse } = require('../utils/response');
const status = require('../constants/statusCodes');

const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return errorResponse(res, status.BAD_REQUEST, result.error.errors[0].message);
  }
  next();
};

module.exports = validate;
