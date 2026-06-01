const prisma = require('../config/prisma');

module.exports = {
  create: (data) => prisma.project.create({ data }),

  findByIdInOrg: (id, organizationId) =>
    prisma.project.findFirst({ where: { id, organizationId } }),

  listForOrg: (organizationId) =>
    prisma.project.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } }),

  update: (id, data) => prisma.project.update({ where: { id }, data }),
  delete: (id)       => prisma.project.delete({ where: { id } }),
};
