const bcrypt = require('bcryptjs');
const userRepo = require('../../repositories/userRepository');
const AppError = require('../../utils/AppError');
const logger = require('../../utils/logger');

const BCRYPT_ROUNDS = 10;

async function requireUserInOrg(id, organizationId) {
  const user = await userRepo.findById(id);
  if (!user || user.organizationId !== organizationId) {
    throw AppError.notFound('User not found');
  }
  return user;
}

const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  organizationId: u.organizationId,
  createdAt: u.createdAt,
});

module.exports = {
  listOrgUsers: (req) => userRepo.listByOrg(req.user.organizationId),

  async createUserInOrg(req) {
    const { name, email, password, role } = req.body;
    if (await userRepo.findByEmail(email)) {
      throw AppError.conflict('A user with this email already exists');
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await userRepo.create({
      organizationId: req.user.organizationId,
      name,
      email,
      passwordHash,
      role,
    });
    logger.info('user.created', {
      by: req.user.id,
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
    });
    return publicUser(user);
  },

  async updateUserRole(req) {
    const target = await requireUserInOrg(req.params.id, req.user.organizationId);
    if (target.id === req.user.id && req.body.role !== 'ADMIN') {
      throw AppError.badRequest('You cannot demote yourself');
    }
    return publicUser(await userRepo.updateRole(target.id, req.body.role));
  },

  async deleteUser(req) {
    const target = await requireUserInOrg(req.params.id, req.user.organizationId);
    if (target.id === req.user.id) throw AppError.badRequest('You cannot delete yourself');
    await userRepo.delete(target.id);
    return { success: true };
  },
};
