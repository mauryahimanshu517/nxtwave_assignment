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
const bcrypt = require('bcryptjs');

const userRepo = require('../repositories/userRepository');
const orgRepo = require('../repositories/organizationRepository');
const refreshRepo = require('../repositories/refreshTokenRepository');

jest.mock('../repositories/userRepository');
jest.mock('../repositories/organizationRepository');
jest.mock('../repositories/refreshTokenRepository');

const app = require('../app');

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Auth flow', () => {
  test('register: creates org + user, returns tokens', async () => {
    userRepo.findByEmail.mockResolvedValue(null);
    orgRepo.create.mockResolvedValue({ id: ORG_ID, name: 'Acme' });
    userRepo.create.mockImplementation(async (data) => ({
      id: USER_ID,
      ...data,
      createdAt: new Date(),
    }));
    refreshRepo.create.mockResolvedValue({ id: 'rt-1' });

    const res = await request(app).post('/api/auth/register').send({
      organizationName: 'Acme',
      name: 'Ada',
      email: 'ada@acme.test',
      password: 'Password123!',
    });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('ada@acme.test');
    expect(res.body.user.role).toBe('ADMIN');
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  test('register: rejects weak password', async () => {
    const res = await request(app).post('/api/auth/register').send({
      organizationName: 'Acme',
      name: 'Ada',
      email: 'ada@acme.test',
      password: 'short',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('register: rejects extra fields (privilege-escalation guard)', async () => {
    const res = await request(app).post('/api/auth/register').send({
      organizationName: 'Acme',
      organizationId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      role: 'ADMIN',
      name: 'Mallory',
      email: 'mallory@acme.test',
      password: 'Password123!',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(userRepo.findByEmail).not.toHaveBeenCalled();
    expect(orgRepo.create).not.toHaveBeenCalled();
  });

  test('login: rejects invalid credentials', async () => {
    userRepo.findByEmail.mockResolvedValue(null);
    const res = await request(app).post('/api/auth/login').send({
      email: 'nope@acme.test',
      password: 'Password123!',
    });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  test('login -> refresh -> rotation revokes old token', async () => {
    const passwordHash = await bcrypt.hash('Password123!', 10);
    const userRow = {
      id: USER_ID,
      organizationId: ORG_ID,
      email: 'ada@acme.test',
      name: 'Ada',
      role: 'ADMIN',
      passwordHash,
      createdAt: new Date(),
    };
    userRepo.findByEmail.mockResolvedValue(userRow);
    userRepo.findById.mockResolvedValue(userRow);

    const created = [];
    refreshRepo.create.mockImplementation(async (data) => {
      const rec = { id: `rt-${created.length + 1}`, ...data, revokedAt: null };
      created.push(rec);
      return rec;
    });
    refreshRepo.findByHash.mockImplementation(async (h) =>
      created.find((r) => r.tokenHash === h),
    );
    refreshRepo.revoke.mockImplementation(async (id, replacedById) => {
      const rec = created.find((r) => r.id === id);
      rec.revokedAt = new Date();
      rec.replacedById = replacedById;
      return rec;
    });
    refreshRepo.revokeIfActive.mockImplementation(async (id, replacedById) => {
      const rec = created.find((r) => r.id === id);
      if (!rec || rec.revokedAt) return false;
      rec.revokedAt = new Date();
      rec.replacedById = replacedById;
      return true;
    });
    refreshRepo.hardDelete.mockImplementation(async (id) => {
      const idx = created.findIndex((r) => r.id === id);
      if (idx >= 0) created.splice(idx, 1);
    });

    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'ada@acme.test',
      password: 'Password123!',
    });
    expect(loginRes.status).toBe(200);
    const { refreshToken } = loginRes.body;

    const refreshRes = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toBeDefined();
    expect(refreshRes.body.refreshToken).not.toBe(refreshToken);

    const replayRes = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(replayRes.status).toBe(401);
  });

  test('refresh: concurrent rotation race — only one request wins', async () => {
    const passwordHash = await bcrypt.hash('Password123!', 10);
    const userRow = {
      id: USER_ID, organizationId: ORG_ID, email: 'ada@acme.test',
      name: 'Ada', role: 'ADMIN', passwordHash, createdAt: new Date(),
    };
    userRepo.findByEmail.mockResolvedValue(userRow);
    userRepo.findById.mockResolvedValue(userRow);

    const created = [];
    refreshRepo.create.mockImplementation(async (data) => {
      const rec = { id: `rt-${created.length + 1}`, ...data, revokedAt: null };
      created.push(rec);
      return rec;
    });
    refreshRepo.findByHash.mockImplementation(async (h) =>
      created.find((r) => r.tokenHash === h),
    );
    refreshRepo.revokeIfActive.mockImplementation(async (id, replacedById) => {
      const rec = created.find((r) => r.id === id);
      if (!rec || rec.revokedAt) return false;
      rec.revokedAt = new Date();
      rec.replacedById = replacedById;
      return true;
    });
    refreshRepo.hardDelete.mockImplementation(async (id) => {
      const idx = created.findIndex((r) => r.id === id);
      if (idx >= 0) created.splice(idx, 1);
    });

    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'ada@acme.test', password: 'Password123!',
    });
    const { refreshToken } = loginRes.body;

    const [a, b] = await Promise.all([
      request(app).post('/api/auth/refresh').send({ refreshToken }),
      request(app).post('/api/auth/refresh').send({ refreshToken }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 401]);

    const activeForUser = created.filter((r) => !r.revokedAt);
    expect(activeForUser).toHaveLength(1);
  });
});
