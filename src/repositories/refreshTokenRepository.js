const prisma = require('../config/prisma');

module.exports = {
  create: (data) => prisma.refreshToken.create({ data }),

  findByHash: (tokenHash) => prisma.refreshToken.findUnique({ where: { tokenHash } }),

  revoke: (id, replacedById = null) =>
    prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date(), replacedById },
    }),

  revokeIfActive: async (id, replacedById = null) => {
    const result = await prisma.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date(), replacedById },
    });
    return result.count > 0;
  },

  hardDelete: (id) => prisma.refreshToken.delete({ where: { id } }),

  revokeAllForUser: (userId) =>
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
};
