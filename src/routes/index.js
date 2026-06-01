const router = require('express').Router();

router.use('/auth', require('../modules/auth/authRoutes'));
router.use('/users', require('../modules/users/userRoutes'));
router.use('/projects', require('../modules/projects/projectRoutes'));
router.use('/tasks', require('../modules/tasks/taskRoutes'));
router.use('/analytics', require('../modules/analytics/analyticsRoutes'));

module.exports = router;
