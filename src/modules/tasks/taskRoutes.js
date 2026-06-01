const router = require('express').Router();
const asyncHandler = require('../../utils/asyncHandler');
const authenticate = require('../../middleware/authenticate');
const validate = require('../../middleware/validate');
const ctrl = require('./taskController');
const {
  createTaskSchema,
  updateTaskSchema,
  updateStatusSchema,
  listQuerySchema,
  idParamSchema,
} = require('../../validations/taskSchemas');

router.use(authenticate);

/**
 * @openapi
 * /api/tasks:
 *   get:
 *     tags: [Tasks]
 *     summary: List tasks with pagination, filtering, and sorting. Cached in Redis (TTL 5m).
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, minimum: 1, maximum: 100 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [TODO, IN_PROGRESS, IN_REVIEW, DONE, BLOCKED] }
 *       - in: query
 *         name: priority
 *         schema: { type: string, enum: [LOW, MEDIUM, HIGH] }
 *       - in: query
 *         name: assignee
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: projectId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [createdAt, updatedAt, dueDate, priority, status], default: createdAt }
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *     responses:
 *       200:
 *         description: Paginated list of tasks
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { type: array, items: { $ref: '#/components/schemas/Task' } }
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:  { type: integer }
 *                     limit: { type: integer }
 *                     total: { type: integer }
 *                     pages: { type: integer }
 *   post:
 *     tags: [Tasks]
 *     summary: Create a task. ADMIN or MANAGER only.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [projectId, title]
 *             properties:
 *               projectId:   { type: string, format: uuid }
 *               title:       { type: string, example: "Wire up Redis" }
 *               description: { type: string }
 *               priority:    { type: string, enum: [LOW, MEDIUM, HIGH] }
 *               assigneeId:  { type: string, format: uuid, nullable: true }
 *               dueDate:     { type: string, format: date-time }
 *     responses:
 *       201: { description: Task created }
 */
router.get('/', validate({ query: listQuerySchema }), asyncHandler(ctrl.list));
router.post('/', validate({ body: createTaskSchema }), asyncHandler(ctrl.create));

/**
 * @openapi
 * /api/tasks/{id}:
 *   get:
 *     tags: [Tasks]
 *     summary: Get a single task. MEMBERs only see tasks assigned to them.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Task }
 *   patch:
 *     tags: [Tasks]
 *     summary: Edit task fields (not status). ADMIN or MANAGER only.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:       { type: string }
 *               description: { type: string }
 *               priority:    { type: string, enum: [LOW, MEDIUM, HIGH] }
 *               assigneeId:  { type: string, format: uuid, nullable: true }
 *               dueDate:     { type: string, format: date-time, nullable: true }
 *     responses:
 *       200: { description: Updated task }
 *   delete:
 *     tags: [Tasks]
 *     summary: Delete a task. ADMIN or MANAGER only.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Deleted }
 */
router.get('/:id', validate({ params: idParamSchema }), asyncHandler(ctrl.get));
router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateTaskSchema }),
  asyncHandler(ctrl.update),
);
router.delete('/:id', validate({ params: idParamSchema }), asyncHandler(ctrl.remove));

/**
 * @openapi
 * /api/tasks/{id}/status:
 *   patch:
 *     tags: [Tasks]
 *     summary: Transition task status. Only the assignee, a MANAGER, or an ADMIN may call this.
 *     description: |
 *       Server-side state machine. Allowed transitions:
 *
 *       - TODO         → IN_PROGRESS, BLOCKED
 *       - IN_PROGRESS  → IN_REVIEW, BLOCKED
 *       - IN_REVIEW    → DONE, BLOCKED
 *       - BLOCKED      → TODO
 *
 *       DONE is terminal. Any other transition returns 400.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [TODO, IN_PROGRESS, IN_REVIEW, DONE, BLOCKED] }
 *     responses:
 *       200: { description: Task with updated status }
 *       400: { description: Invalid transition }
 *       403: { description: Not the assignee and not a manager }
 */
router.patch(
  '/:id/status',
  validate({ params: idParamSchema, body: updateStatusSchema }),
  asyncHandler(ctrl.updateStatus),
);

module.exports = router;
