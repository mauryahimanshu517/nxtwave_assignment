const taskRepo = require('../../repositories/taskRepository');
const projectRepo = require('../../repositories/projectRepository');
const userRepo = require('../../repositories/userRepository');
const AppError = require('../../utils/AppError');
const { validateTransition } = require('../../utils/statusTransitions');
const cache = require('../../services/cacheService');
const logger = require('../../utils/logger');

async function requireProject(projectId, organizationId) {
  const p = await projectRepo.findByIdInOrg(projectId, organizationId);
  if (!p) throw AppError.notFound('Project not found');
  return p;
}

async function requireAssigneeInOrg(assigneeId, organizationId) {
  if (!assigneeId) return;
  const u = await userRepo.findById(assigneeId);
  if (!u || u.organizationId !== organizationId) {
    throw AppError.badRequest('Assignee must be a user in your organization');
  }
}

async function requireTask(id, organizationId) {
  const task = await taskRepo.findByIdInOrg(id, organizationId);
  if (!task) throw AppError.notFound('Task not found');
  return task;
}

async function createTask(req) {
  const { user, body } = req;
  if (user.role === 'MEMBER') throw AppError.forbidden('MEMBERs cannot create tasks');

  await requireProject(body.projectId, user.organizationId);
  await requireAssigneeInOrg(body.assigneeId, user.organizationId);

  const task = await taskRepo.create({
    projectId: body.projectId,
    title: body.title,
    description: body.description,
    priority: body.priority || 'MEDIUM',
    assigneeId: body.assigneeId || null,
    dueDate: body.dueDate ? new Date(body.dueDate) : null,
  });

  await cache.invalidateTaskCache(user.organizationId, [task.assigneeId]);
  return task;
}

async function getTask(req) {
  const task = await requireTask(req.params.id, req.user.organizationId);
  if (req.user.role === 'MEMBER' && task.assigneeId !== req.user.id) {
    throw AppError.forbidden('You can only view tasks assigned to you');
  }
  return task;
}

async function updateTask(req) {
  const { user, params, body } = req;
  if (user.role === 'MEMBER') {
    throw AppError.forbidden('MEMBERs cannot edit tasks. Use the status endpoint.');
  }

  const existing = await requireTask(params.id, user.organizationId);
  if (body.assigneeId !== undefined) {
    await requireAssigneeInOrg(body.assigneeId, user.organizationId);
  }

  const data = {};
  if (body.title !== undefined)       data.title = body.title;
  if (body.description !== undefined) data.description = body.description;
  if (body.priority !== undefined)    data.priority = body.priority;
  if (body.assigneeId !== undefined)  data.assigneeId = body.assigneeId;
  if (body.dueDate !== undefined)     data.dueDate = body.dueDate ? new Date(body.dueDate) : null;

  const updated = await taskRepo.update(params.id, data);

  await cache.invalidateTaskCache(
    user.organizationId,
    [existing.assigneeId, updated.assigneeId].filter(Boolean),
  );
  return updated;
}

async function deleteTask(req) {
  if (req.user.role === 'MEMBER') throw AppError.forbidden('MEMBERs cannot delete tasks');
  const existing = await requireTask(req.params.id, req.user.organizationId);
  await taskRepo.delete(existing.id);
  await cache.invalidateTaskCache(req.user.organizationId, [existing.assigneeId]);
  return { success: true };
}

async function updateStatus(req) {
  const { user, params, body } = req;
  const task = await requireTask(params.id, user.organizationId);

  const isAssignee = task.assigneeId === user.id;
  const isPrivileged = user.role === 'MANAGER' || user.role === 'ADMIN';
  if (!isAssignee && !isPrivileged) {
    throw AppError.forbidden('Only the assignee or a manager can change task status');
  }

  const { ok, message } = validateTransition(task.status, body.status);
  if (!ok) throw AppError.badRequest(message);

  const data = { status: body.status };
  if (body.status === 'DONE') data.completedAt = new Date();
  else if (task.status === 'DONE') data.completedAt = null;

  const updated = await taskRepo.update(task.id, data);
  await cache.invalidateTaskCache(user.organizationId, [updated.assigneeId]);
  logger.info('task.status_changed', {
    taskId: updated.id,
    from: task.status,
    to: updated.status,
    by: user.id,
  });
  return updated;
}

async function listTasks(req) {
  const { user } = req;
  const q = req.validatedQuery;

  const where = { project: { organizationId: user.organizationId } };
  if (q.status)    where.status = q.status;
  if (q.priority)  where.priority = q.priority;
  if (q.assignee)  where.assigneeId = q.assignee;
  if (q.projectId) where.projectId = q.projectId;

  if (user.role === 'MEMBER') where.assigneeId = user.id;

  const cacheAssigneeId = user.role === 'MEMBER' ? user.id : q.assignee || null;

  const cacheKey = cache.buildTaskListKey({
    organizationId: user.organizationId,
    assigneeId: cacheAssigneeId,
    filters: q,
  });

  const cached = await cache.getTaskList(cacheKey);
  if (cached) return cached;

  const [data, total] = await taskRepo.list({
    where,
    orderBy: { [q.sortBy]: q.sortOrder },
    skip: (q.page - 1) * q.limit,
    take: q.limit,
  });

  const response = {
    data,
    pagination: {
      page: q.page,
      limit: q.limit,
      total,
      pages: Math.max(1, Math.ceil(total / q.limit)),
    },
  };

  await cache.setTaskList(cacheKey, response, {
    organizationId: user.organizationId,
    assigneeId: cacheAssigneeId,
  });
  return response;
}

module.exports = { createTask, getTask, updateTask, deleteTask, updateStatus, listTasks };
