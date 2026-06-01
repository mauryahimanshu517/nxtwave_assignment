const rateLimit = require('express-rate-limit');
const router = require('express').Router();
const asyncHandler = require('../../utils/asyncHandler');
const validate = require('../../middleware/validate');
const ctrl = require('./authController');
const {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
} = require('../../validations/authSchemas');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => process.env.NODE_ENV === 'test',
  message: { status: 429, code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' },
});

router.use(authLimiter);

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new organization. The registering user becomes its ADMIN.
 *     description: |
 *       Public endpoint. To add users to an existing organization, an ADMIN
 *       of that org must call `POST /api/users`.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [organizationName, name, email, password]
 *             properties:
 *               organizationName: { type: string, example: "Acme Inc." }
 *               name:     { type: string, example: "Ada Admin" }
 *               email:    { type: string, format: email, example: "admin@acme.test" }
 *               password: { type: string, minLength: 8, example: "Password123!" }
 *     responses:
 *       201: { description: New organization + ADMIN user created with tokens }
 *       400: { description: Validation error }
 *       409: { description: Email already exists }
 */
router.post('/register', validate({ body: registerSchema }), asyncHandler(ctrl.register));

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in and receive access + refresh tokens.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:    { type: string, example: "admin@acme.test" }
 *               password: { type: string, example: "Password123!" }
 *     responses:
 *       200: { description: Tokens issued }
 *       401: { description: Invalid credentials }
 */
router.post('/login', validate({ body: loginSchema }), asyncHandler(ctrl.login));

/**
 * @openapi
 * /api/auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Rotate a refresh token — returns new access + refresh tokens and revokes the old one.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200: { description: New token pair }
 *       401: { description: Invalid/revoked/expired refresh token }
 */
router.post('/refresh', validate({ body: refreshSchema }), asyncHandler(ctrl.refresh));

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Revoke the supplied refresh token. Idempotent.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200: { description: Logged out }
 */
router.post('/logout', validate({ body: logoutSchema }), asyncHandler(ctrl.logout));

module.exports = router;
