const svc = require('./projectService');

module.exports = {
  create: async (req, res) => res.status(201).json(await svc.create(req)),
  list:   async (req, res) => res.json(await svc.list(req)),
  get:    async (req, res) => res.json(await svc.get(req)),
  update: async (req, res) => res.json(await svc.update(req)),
  remove: async (req, res) => res.json(await svc.remove(req)),
};
