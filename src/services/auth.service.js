const { prisma } = require('../config/prisma');
const bcrypt = require('bcryptjs');
const jwt = require('../utils/jwt');

exports.signup = async ({ email, password, displayName }) => {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error('User already exists');

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, password: hashed, displayName,  provider: 'email' }
  });

  const token = jwt.sign({ id: user.id });

  return { user, token };
};

exports.login = async ({ email, password }) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error('User not found');

  const match = await bcrypt.compare(password, user.password);
  if (!match) throw new Error('Invalid credentials');

  const token = jwt.sign({ id: user.id });
  return { user, token };
};
