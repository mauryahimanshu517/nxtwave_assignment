const prisma = require('../config/prisma');

const select = {
  id: true,
  projectId: true,
  title: true,
  description: true,
  priority: true,
  status: true,
  assigneeId: true,
  dueDate: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
};

module.exports = {
  create: (data) => prisma.task.create({ data, select }),

  findByIdInOrg: (id, organizationId) =>
    prisma.task.findFirst({ where: { id, project: { organizationId } }, select }),

  list: ({ where, orderBy, skip, take }) =>
    Promise.all([
      prisma.task.findMany({ where, orderBy, skip, take, select }),
      prisma.task.count({ where }),
    ]),

  update: (id, data) => prisma.task.update({ where: { id }, data, select }),

  delete: (id) => prisma.task.delete({ where: { id } }),
};
