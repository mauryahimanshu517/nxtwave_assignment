const prisma = require('../config/prisma');

module.exports = {
  findById: (id) => prisma.organization.findUnique({ where: { id } }),
  create:   (data) => prisma.organization.create({ data }),
};
