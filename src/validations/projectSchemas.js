const { z } = require('zod');

const createProjectSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
});

const updateProjectSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).optional(),
  })
  .refine((v) => v.name !== undefined || v.description !== undefined, {
    message: 'At least one of name or description must be provided',
  });

const idParamSchema = z.object({ id: z.string().uuid() });

module.exports = { createProjectSchema, updateProjectSchema, idParamSchema };
