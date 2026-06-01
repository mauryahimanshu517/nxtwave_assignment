const svc = require('./userService');

module.exports = {
  list:       async (req, res) => res.json(await svc.listOrgUsers(req)),
  create:     async (req, res) => res.status(201).json(await svc.createUserInOrg(req)),
  updateRole: async (req, res) => res.json(await svc.updateUserRole(req)),
  remove:     async (req, res) => res.json(await svc.deleteUser(req)),
};
