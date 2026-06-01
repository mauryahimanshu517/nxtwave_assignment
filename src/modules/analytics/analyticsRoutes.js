const router = require('express').Router();
const asyncHandler = require('../../utils/asyncHandler');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const ctrl = require('./analyticsController');

router.use(authenticate);

/**
 * @openapi
 * /api/analytics/tasks:
 *   get:
 *     tags: [Analytics]
 *     summary: Org-wide task analytics. ADMIN or MANAGER only.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Aggregated metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 overdueTasksPerUser:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       userId:        { type: string, format: uuid }
 *                       userName:      { type: string }
 *                       userEmail:     { type: string }
 *                       overdueCount:  { type: integer }
 *                 averageCompletionTimeHours:
 *                   type: number
 *                   nullable: true
 *                   example: 24.6
 */
router.get('/tasks', authorize('ADMIN', 'MANAGER'), asyncHandler(ctrl.tasks));

module.exports = router;
