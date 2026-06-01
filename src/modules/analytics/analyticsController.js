const { getTaskAnalytics } = require('./analyticsService');

module.exports = {
  tasks: async (req, res) => res.json(await getTaskAnalytics(req.user.organizationId)),
};
