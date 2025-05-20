const bcrypt = require('bcryptjs');

exports.hashPassword = (plain) => bcrypt.hash(plain, 10);

exports.comparePassword = (plain, hashed) => bcrypt.compare(plain, hashed);
