const repo = require('../../repositories/projectRepository');
const AppError = require('../../utils/AppError');

async function requireProject(id, organizationId) {
  const project = await repo.findByIdInOrg(id, organizationId);
  if (!project) throw AppError.notFound('Project not found');
  return project;
}

module.exports = {
  create: (req) =>
    repo.create({
      organizationId: req.user.organizationId,
      name: req.body.name,
      description: req.body.description,
    }),

  list: (req) => repo.listForOrg(req.user.organizationId),

  get: (req) => requireProject(req.params.id, req.user.organizationId),

  async update(req) {
    await requireProject(req.params.id, req.user.organizationId);
    return repo.update(req.params.id, req.body);
  },

  async remove(req) {
    await requireProject(req.params.id, req.user.organizationId);
    await repo.delete(req.params.id);
    return { success: true };
  },
};
