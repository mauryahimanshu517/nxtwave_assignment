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

const projectRepo = require('../repositories/projectRepository');
jest.mock('../repositories/projectRepository');

const app = require('../app');
const { signAccessToken } = require('../utils/jwt');

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const OTHER_ORG_ID = '00000000-0000-0000-0000-000000000099';
const PROJECT_ID = '22222222-2222-2222-2222-222222222222';
const ADMIN_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const MANAGER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MEMBER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function tokenFor(id, role, orgId = ORG_ID) {
  return signAccessToken({
    sub: id,
    organizationId: orgId,
    role,
    email: `${role.toLowerCase()}@acme.test`,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/projects', () => {
  test('MEMBER can list projects', async () => {
    projectRepo.listForOrg.mockResolvedValue([
      { id: PROJECT_ID, organizationId: ORG_ID, name: 'P1', description: null, createdAt: new Date() },
    ]);
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${tokenFor(MEMBER_ID, 'MEMBER')}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(projectRepo.listForOrg).toHaveBeenCalledWith(ORG_ID);
  });

  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/projects — RBAC', () => {
  test('MEMBER cannot create', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${tokenFor(MEMBER_ID, 'MEMBER')}`)
      .send({ name: 'New' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(projectRepo.create).not.toHaveBeenCalled();
  });

  test('MANAGER can create', async () => {
    projectRepo.create.mockResolvedValue({
      id: PROJECT_ID, organizationId: ORG_ID, name: 'New', description: null, createdAt: new Date(),
    });
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${tokenFor(MANAGER_ID, 'MANAGER')}`)
      .send({ name: 'New', description: 'demo' });
    expect(res.status).toBe(201);
    expect(projectRepo.create).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      name: 'New',
      description: 'demo',
    });
  });

  test('ADMIN can create', async () => {
    projectRepo.create.mockResolvedValue({ id: PROJECT_ID, organizationId: ORG_ID, name: 'New', description: null, createdAt: new Date() });
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${tokenFor(ADMIN_ID, 'ADMIN')}`)
      .send({ name: 'New' });
    expect(res.status).toBe(201);
  });

  test('rejects missing name', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${tokenFor(MANAGER_ID, 'MANAGER')}`)
      .send({ description: 'no name' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/projects/:id — tenant isolation', () => {
  test('returns 404 for a project in another organization', async () => {
    projectRepo.findByIdInOrg.mockImplementation(async (id, orgId) =>
      orgId === OTHER_ORG_ID
        ? { id, organizationId: OTHER_ORG_ID, name: 'Other', description: null, createdAt: new Date() }
        : null,
    );
    const res = await request(app)
      .get(`/api/projects/${PROJECT_ID}`)
      .set('Authorization', `Bearer ${tokenFor(ADMIN_ID, 'ADMIN', ORG_ID)}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  test('returns 200 for a project in the same organization', async () => {
    projectRepo.findByIdInOrg.mockResolvedValue({
      id: PROJECT_ID, organizationId: ORG_ID, name: 'P1', description: null, createdAt: new Date(),
    });
    const res = await request(app)
      .get(`/api/projects/${PROJECT_ID}`)
      .set('Authorization', `Bearer ${tokenFor(ADMIN_ID, 'ADMIN', ORG_ID)}`);
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/projects/:id — RBAC', () => {
  test('MEMBER cannot update', async () => {
    const res = await request(app)
      .patch(`/api/projects/${PROJECT_ID}`)
      .set('Authorization', `Bearer ${tokenFor(MEMBER_ID, 'MEMBER')}`)
      .send({ name: 'Renamed' });
    expect(res.status).toBe(403);
    expect(projectRepo.update).not.toHaveBeenCalled();
  });

  test('MANAGER can update', async () => {
    projectRepo.findByIdInOrg.mockResolvedValue({
      id: PROJECT_ID, organizationId: ORG_ID, name: 'P1', description: null, createdAt: new Date(),
    });
    projectRepo.update.mockResolvedValue({
      id: PROJECT_ID, organizationId: ORG_ID, name: 'Renamed', description: null, createdAt: new Date(),
    });
    const res = await request(app)
      .patch(`/api/projects/${PROJECT_ID}`)
      .set('Authorization', `Bearer ${tokenFor(MANAGER_ID, 'MANAGER')}`)
      .send({ name: 'Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed');
  });

  test('rejects empty update body', async () => {
    const res = await request(app)
      .patch(`/api/projects/${PROJECT_ID}`)
      .set('Authorization', `Bearer ${tokenFor(MANAGER_ID, 'MANAGER')}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/projects/:id — RBAC', () => {
  test('MEMBER cannot delete', async () => {
    const res = await request(app)
      .delete(`/api/projects/${PROJECT_ID}`)
      .set('Authorization', `Bearer ${tokenFor(MEMBER_ID, 'MEMBER')}`);
    expect(res.status).toBe(403);
    expect(projectRepo.delete).not.toHaveBeenCalled();
  });

  test('MANAGER can delete', async () => {
    projectRepo.findByIdInOrg.mockResolvedValue({
      id: PROJECT_ID, organizationId: ORG_ID, name: 'P1', description: null, createdAt: new Date(),
    });
    projectRepo.delete.mockResolvedValue(undefined);
    const res = await request(app)
      .delete(`/api/projects/${PROJECT_ID}`)
      .set('Authorization', `Bearer ${tokenFor(MANAGER_ID, 'MANAGER')}`);
    expect(res.status).toBe(200);
    expect(projectRepo.delete).toHaveBeenCalledWith(PROJECT_ID);
  });

  test('ADMIN can delete', async () => {
    projectRepo.findByIdInOrg.mockResolvedValue({
      id: PROJECT_ID, organizationId: ORG_ID, name: 'P1', description: null, createdAt: new Date(),
    });
    projectRepo.delete.mockResolvedValue(undefined);
    const res = await request(app)
      .delete(`/api/projects/${PROJECT_ID}`)
      .set('Authorization', `Bearer ${tokenFor(ADMIN_ID, 'ADMIN')}`);
    expect(res.status).toBe(200);
  });
});
