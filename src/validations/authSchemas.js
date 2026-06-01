const { z } = require('zod');

const registerSchema = z
  .object({
    organizationName: z.string().min(1).max(120),
    name: z.string().min(1).max(120),
    email: z.string().email().max(255).toLowerCase(),
    password: z.string().min(8).max(72),
  })
  .strict();

const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

const refreshSchema = z.object({ refreshToken: z.string().min(10) });
const logoutSchema  = z.object({ refreshToken: z.string().min(10) });

module.exports = { registerSchema, loginSchema, refreshSchema, logoutSchema };
