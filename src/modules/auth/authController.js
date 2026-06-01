const auth = require('./authService');

module.exports = {
  register: async (req, res) => res.status(201).json(await auth.register(req.body)),
  login:    async (req, res) => res.json(await auth.login(req.body)),
  refresh:  async (req, res) => res.json(await auth.refresh(req.body)),
  logout:   async (req, res) => res.json(await auth.logout(req.body)),
};
