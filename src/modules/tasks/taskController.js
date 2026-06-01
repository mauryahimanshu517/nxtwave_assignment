const svc = require('./taskService');

module.exports = {
  create:       async (req, res) => res.status(201).json(await svc.createTask(req)),
  list:         async (req, res) => res.json(await svc.listTasks(req)),
  get:          async (req, res) => res.json(await svc.getTask(req)),
  update:       async (req, res) => res.json(await svc.updateTask(req)),
  remove:       async (req, res) => res.json(await svc.deleteTask(req)),
  updateStatus: async (req, res) => res.json(await svc.updateStatus(req)),
};
