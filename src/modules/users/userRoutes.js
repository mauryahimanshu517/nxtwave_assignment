const router = require('express').Router();
const asyncHandler = require('../../utils/asyncHandler');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const validate = require('../../middleware/validate');
const ctrl = require('./userController');
const {
  updateRoleSchema,
  createUserSchema,
  idParamSchema,
} = require('../../validations/userSchemas');

router.use(authenticate);

/**
 * @openapi
 * /api/users:
 *   get:
 *     tags: [Users]
 *     summary: List users in the caller's organization.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: User list }
 *   post:
 *     tags: [Users]
 *     summary: Add a user to the caller's organization. ADMIN only.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name:     { type: string, example: "Marco Manager" }
 *               email:    { type: string, format: email, example: "manager@acme.test" }
 *               password: { type: string, minLength: 8, example: "Password123!" }
 *               role:     { type: string, enum: [ADMIN, MANAGER, MEMBER], default: MEMBER }
 *     responses:
 *       201: { description: User created in your organization }
 *       409: { description: Email already exists }
 */
router.get('/', authorize('ADMIN', 'MANAGER'), asyncHandler(ctrl.list));

router.post(
  '/',
  authorize('ADMIN'),
  validate({ body: createUserSchema }),
  asyncHandler(ctrl.create),
);

/**
 * @openapi
 * /api/users/{id}/role:
 *   patch:
 *     tags: [Users]
 *     summary: Change a user's role. Admin only.
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
 *               role: { type: string, enum: [ADMIN, MANAGER, MEMBER] }
 *     responses:
 *       200: { description: Updated user }
 *       404: { description: User not in your organization }
 */
router.patch(
  '/:id/role',
  authorize('ADMIN'),
  validate({ params: idParamSchema, body: updateRoleSchema }),
  asyncHandler(ctrl.updateRole),
);

/**
 * @openapi
 * /api/users/{id}:
 *   delete:
 *     tags: [Users]
 *     summary: Delete a user. Admin only.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Deleted }
 */
router.delete(
  '/:id',
  authorize('ADMIN'),
  validate({ params: idParamSchema }),
  asyncHandler(ctrl.remove),
);

module.exports = router;
