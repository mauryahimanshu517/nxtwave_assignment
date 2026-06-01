const { z } = require('zod');

const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'BLOCKED'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];

const futureIsoDate = z
  .string()
  .datetime({ message: 'dueDate must be an ISO 8601 datetime' })
  .refine((v) => new Date(v).getTime() > Date.now(), {
    message: 'dueDate must be a future date',
  });

const createTaskSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  dueDate: futureIsoDate.optional(),
});

const updateTaskSchema = z
  .object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().max(5000).optional(),
    priority: z.enum(PRIORITIES).optional(),
    assigneeId: z.string().uuid().nullable().optional(),
    dueDate: futureIsoDate.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
  });

const updateStatusSchema = z.object({ status: z.enum(TASK_STATUSES) });

const listQuerySchema = z.object({
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(100).default(20),
  status:    z.enum(TASK_STATUSES).optional(),
  priority:  z.enum(PRIORITIES).optional(),
  assignee:  z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  sortBy:    z.enum(['createdAt', 'updatedAt', 'dueDate', 'priority', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const idParamSchema = z.object({ id: z.string().uuid() });

module.exports = {
  TASK_STATUSES,
  PRIORITIES,
  createTaskSchema,
  updateTaskSchema,
  updateStatusSchema,
  listQuerySchema,
  idParamSchema,
};
