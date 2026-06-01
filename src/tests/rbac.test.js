const authorize = require('../middleware/authorize');

function runMiddleware(mw, req) {
  return new Promise((resolve) => {
    mw(req, {}, (err) => resolve(err));
  });
}

describe('authorize() middleware', () => {
  test('throws if called with no roles', () => {
    expect(() => authorize()).toThrow();
  });

  test('rejects unauthenticated request', async () => {
    const err = await runMiddleware(authorize('ADMIN'), {});
    expect(err.status).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });

  test('forbids users not in the allowed set', async () => {
    const err = await runMiddleware(authorize('ADMIN'), { user: { role: 'MEMBER' } });
    expect(err.status).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });

  test('allows ADMIN when only ADMIN permitted', async () => {
    const err = await runMiddleware(authorize('ADMIN'), { user: { role: 'ADMIN' } });
    expect(err).toBeUndefined();
  });

  test('allows MANAGER when ADMIN or MANAGER permitted', async () => {
    const err = await runMiddleware(authorize('ADMIN', 'MANAGER'), { user: { role: 'MANAGER' } });
    expect(err).toBeUndefined();
  });

  test('forbids MEMBER when only ADMIN or MANAGER permitted', async () => {
    const err = await runMiddleware(authorize('ADMIN', 'MANAGER'), { user: { role: 'MEMBER' } });
    expect(err.status).toBe(403);
  });
});
