exports.successResponse = (res, code, message, data = {}) => {
  res.status(code).json({ success: true, message, data });
};

exports.errorResponse = (res, code, message) => {
  res.status(code).json({ success: false, message });
};
