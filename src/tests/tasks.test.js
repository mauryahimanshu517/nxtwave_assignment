jest.mock('../config/prisma', () => ({
  user: {},
  organization: {},
  project: {},
  task: {},
  refreshToken: {},
  $queryRaw: jest.fn(),
  $disconnect: jest.fn(),
}));

jest.mock('../config/redis', () => ({
  getRedis: () => ({ status: 'end' }),
}));

const request = require('supertest');

const taskRepo = require('../repositories/taskRepository');
const projectRepo = require('../repositories/projectRepository');
const userRepo = require('../repositories/userRepository');

jest.mock('../repositories/taskRepository', () => ({
  create: jest.fn(),
  findByIdInOrg: jest.fn(),
  list: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
}));
jest.mock('../repositories/projectRepository');
jest.mock('../repositories/userRepository');

const app = require('../app');
const { signAccessToken } = require('../utils/jwt');

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const PROJECT_ID = '22222222-2222-2222-2222-222222222222';
const ADMIN_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const MANAGER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MEMBER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const OTHER_MEMBER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

function tokenFor(id, role) {
  return signAccessToken({
    sub: id,
    organizationId: ORG_ID,
    role,
    email: `${role.toLowerCase()}@acme.test`,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  projectRepo.findByIdInOrg.mockResolvedValue({ id: PROJECT_ID, organizationId: ORG_ID });
  userRepo.findById.mockImplementation(async (id) => ({ id, organizationId: ORG_ID }));
});

describe('GET /api/tasks — filtering & pagination', () => {
  test('forwards status/priority filters to the repo and shapes the response', async () => {
    taskRepo.list.mockResolvedValue([
      [{ id: 'task-1', status: 'TODO', priority: 'HIGH', assigneeId: null }],
      37,
    ]);

    const res = await request(app)
      .get('/api/tasks?status=TODO&priority=HIGH&page=2&limit=10&sortBy=dueDate&sortOrder=asc')
      .set('Authorization', `Bearer ${tokenFor(ADMIN_ID, 'ADMIN')}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination).toEqual({ page: 2, limit: 10, total: 37, pages: 4 });

    const arg = taskRepo.list.mock.calls[0][0];
    expect(arg.where.status).toBe('TODO');
    expect(arg.where.priority).toBe('HIGH');
    expect(arg.where.project).toEqual({ organizationId: ORG_ID });
    expect(arg.orderBy).toEqual({ dueDate: 'asc' });
    expect(arg.skip).toBe(10);
    expect(arg.take).toBe(10);
  });

  test('MEMBER is silently restricted to their own tasks', async () => {
    taskRepo.list.mockResolvedValue([[], 0]);

    const res = await request(app)
      .get('/api/tasks?assignee=' + OTHER_MEMBER_ID)
      .set('Authorization', `Bearer ${tokenFor(MEMBER_ID, 'MEMBER')}`);

    expect(res.status).toBe(200);
    const arg = taskRepo.list.mock.calls[0][0];
    expect(arg.where.assigneeId).toBe(MEMBER_ID);
  });

  test('rejects invalid sortBy', async () => {
    const res = await request(app)
      .get('/api/tasks?sortBy=ssn')
      .set('Authorization', `Bearer ${tokenFor(ADMIN_ID, 'ADMIN')}`);
    expect(res.status).toBe(400);
  });

  test('rejects invalid status enum', async () => {
    const res = await request(app)
      .get('/api/tasks?status=DOING')
      .set('Authorization', `Bearer ${tokenFor(ADMIN_ID, 'ADMIN')}`);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/tasks — RBAC', () => {
  test('MEMBER cannot create a task', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${tokenFor(MEMBER_ID, 'MEMBER')}`)
      .send({ projectId: PROJECT_ID, title: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  test('MANAGER can create a task', async () => {
    taskRepo.create.mockResolvedValue({
      id: 'task-1', projectId: PROJECT_ID, title: 'x', status: 'TODO',
      priority: 'MEDIUM', assigneeId: MEMBER_ID, dueDate: null, completedAt: null,
      description: null, createdAt: new Date(), updatedAt: new Date(),
    });

    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${tokenFor(MANAGER_ID, 'MANAGER')}`)
      .send({ projectId: PROJECT_ID, title: 'x', assigneeId: MEMBER_ID });
    expect(res.status).toBe(201);
    expect(taskRepo.create).toHaveBeenCalled();
  });

  test('past dueDate is rejected by validation', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${tokenFor(MANAGER_ID, 'MANAGER')}`)
      .send({
        projectId: PROJECT_ID,
        title: 'x',
        dueDate: '2000-01-01T00:00:00.000Z',
      });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/tasks/:id/status — permissions & transitions', () => {
  const TASK_ID = '33333333-3333-3333-3333-333333333333';

  test('rejects when a non-assignee, non-manager tries to update', async () => {
    taskRepo.findByIdInOrg.mockResolvedValue({
      id: TASK_ID, status: 'TODO', assigneeId: OTHER_MEMBER_ID,
    });
    const res = await request(app)
      .patch(`/api/tasks/${TASK_ID}/status`)
      .set('Authorization', `Bearer ${tokenFor(MEMBER_ID, 'MEMBER')}`)
      .send({ status: 'IN_PROGRESS' });
    expect(res.status).toBe(403);
  });

  test('assignee can move TODO -> IN_PROGRESS', async () => {
    taskRepo.findByIdInOrg.mockResolvedValue({
      id: TASK_ID, status: 'TODO', assigneeId: MEMBER_ID,
    });
    taskRepo.update.mockResolvedValue({ id: TASK_ID, status: 'IN_PROGRESS', assigneeId: MEMBER_ID });

    const res = await request(app)
      .patch(`/api/tasks/${TASK_ID}/status`)
      .set('Authorization', `Bearer ${tokenFor(MEMBER_ID, 'MEMBER')}`)
      .send({ status: 'IN_PROGRESS' });
    expect(res.status).toBe(200);
    expect(taskRepo.update).toHaveBeenCalledWith(TASK_ID, expect.objectContaining({ status: 'IN_PROGRESS' }));
  });

  test('assignee cannot skip from TODO -> DONE', async () => {
    taskRepo.findByIdInOrg.mockResolvedValue({
      id: TASK_ID, status: 'TODO', assigneeId: MEMBER_ID,
    });
    const res = await request(app)
      .patch(`/api/tasks/${TASK_ID}/status`)
      .set('Authorization', `Bearer ${tokenFor(MEMBER_ID, 'MEMBER')}`)
      .send({ status: 'DONE' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid status transition/);
  });

  test('MANAGER (not assignee) can update status', async () => {
    taskRepo.findByIdInOrg.mockResolvedValue({
      id: TASK_ID, status: 'IN_REVIEW', assigneeId: MEMBER_ID,
    });
    taskRepo.update.mockResolvedValue({
      id: TASK_ID, status: 'DONE', assigneeId: MEMBER_ID, completedAt: new Date(),
    });
    const res = await request(app)
      .patch(`/api/tasks/${TASK_ID}/status`)
      .set('Authorization', `Bearer ${tokenFor(MANAGER_ID, 'MANAGER')}`)
      .send({ status: 'DONE' });
    expect(res.status).toBe(200);
    expect(taskRepo.update.mock.calls[0][1]).toEqual(
      expect.objectContaining({ status: 'DONE', completedAt: expect.any(Date) }),
    );
  });
});

describe('Authentication', () => {
  test('rejects request with no token', async () => {
    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(401);
  });
});
