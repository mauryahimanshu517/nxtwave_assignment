const prisma = require('../config/prisma');

module.exports = {
  findByEmail: (email) => prisma.user.findUnique({ where: { email } }),
  findById:    (id)    => prisma.user.findUnique({ where: { id } }),

  create: (data) => prisma.user.create({ data }),

  listByOrg: (organizationId) =>
    prisma.user.findMany({
      where: { organizationId },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),

  updateRole: (id, role) => prisma.user.update({ where: { id }, data: { role } }),

  delete: (id) => prisma.user.delete({ where: { id } }),
};
