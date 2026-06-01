const router = require('express').Router();
const asyncHandler = require('../../utils/asyncHandler');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const validate = require('../../middleware/validate');
const ctrl = require('./projectController');
const {
  createProjectSchema,
  updateProjectSchema,
  idParamSchema,
} = require('../../validations/projectSchemas');

router.use(authenticate);

/**
 * @openapi
 * /api/projects:
 *   get:
 *     tags: [Projects]
 *     summary: List projects in the caller's organization.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Project list }
 *   post:
 *     tags: [Projects]
 *     summary: Create a project. ADMIN or MANAGER only.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:        { type: string, example: "Mobile App" }
 *               description: { type: string, example: "Cross-platform mobile app" }
 *     responses:
 *       201: { description: Project created }
 *       403: { description: Forbidden (MEMBER cannot create) }
 */
router.get('/', asyncHandler(ctrl.list));
router.post(
  '/',
  authorize('ADMIN', 'MANAGER'),
  validate({ body: createProjectSchema }),
  asyncHandler(ctrl.create),
);

/**
 * @openapi
 * /api/projects/{id}:
 *   get:
 *     tags: [Projects]
 *     summary: Get one project by id.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Project }
 *       404: { description: Not found }
 *   patch:
 *     tags: [Projects]
 *     summary: Update a project. ADMIN or MANAGER only.
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
 *               name:        { type: string }
 *               description: { type: string }
 *     responses:
 *       200: { description: Updated project }
 *   delete:
 *     tags: [Projects]
 *     summary: Delete a project. ADMIN or MANAGER only.
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
  authorize('ADMIN', 'MANAGER'),
  validate({ params: idParamSchema, body: updateProjectSchema }),
  asyncHandler(ctrl.update),
);

router.delete(
  '/:id',
  authorize('ADMIN', 'MANAGER'),
  validate({ params: idParamSchema }),
  asyncHandler(ctrl.remove),
);

module.exports = router;
