const { z } = require('zod');

const updateRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MANAGER', 'MEMBER']),
});

const createUserSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(255).toLowerCase(),
  password: z.string().min(8).max(72),
  role: z.enum(['ADMIN', 'MANAGER', 'MEMBER']).default('MEMBER'),
});

const idParamSchema = z.object({ id: z.string().uuid() });

module.exports = { updateRoleSchema, createUserSchema, idParamSchema };
