// controllers/travelInterest.controller.js
const { prisma } = require('../config/prisma');
const { successResponse, errorResponse } = require('../utils/response');

exports.createInterest = async (req, res, next) => {
  try {
    const { names } = req.body; // Expecting: { names: ["Adventure", "Photography", ...] }

    if (!Array.isArray(names) || names.length === 0) {
      return errorResponse(res, 400, 'Names must be a non-empty array');
    }

    const data = await prisma.travelInterest.createMany({
      data: names.map((name) => ({ name })),
      skipDuplicates: true // Avoid error if interest already exists
    });

    successResponse(res, 201, 'Travel interests created successfully', data);
  } catch (err) {
    next(err);
  }
};


exports.getAllInterests = async (req, res, next) => {
  try {
    const interests = await prisma.travelInterest.findMany({ orderBy: { name: 'asc' } });
    successResponse(res, 200, 'All interests', interests);
  } catch (err) {
    next(err);
  }
};

exports.deleteInterest = async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.travelInterest.delete({ where: { id } });
    successResponse(res, 200, 'Interest deleted');
  } catch (err) {
    next(err);
  }
};

exports.updateInterest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const updated = await prisma.travelInterest.update({
      where: { id },
      data: { name }
    });
    successResponse(res, 200, 'Interest updated', updated);
  } catch (err) {
    next(err);
  }
};
