const {
  isValidTransition,
  validateTransition,
} = require('../utils/statusTransitions');

describe('status transitions', () => {
  describe('valid transitions', () => {
    test.each([
      ['TODO', 'IN_PROGRESS'],
      ['TODO', 'BLOCKED'],
      ['IN_PROGRESS', 'IN_REVIEW'],
      ['IN_PROGRESS', 'BLOCKED'],
      ['IN_REVIEW', 'DONE'],
      ['IN_REVIEW', 'BLOCKED'],
      ['BLOCKED', 'TODO'],
    ])('%s -> %s is allowed', (from, to) => {
      expect(isValidTransition(from, to)).toBe(true);
      expect(validateTransition(from, to)).toEqual({ ok: true });
    });
  });

  describe('invalid transitions', () => {
    test.each([
      ['TODO', 'IN_REVIEW'],
      ['TODO', 'DONE'],
      ['IN_PROGRESS', 'DONE'],
      ['IN_PROGRESS', 'TODO'],
      ['DONE', 'TODO'],
      ['DONE', 'IN_PROGRESS'],
      ['BLOCKED', 'IN_PROGRESS'],
      ['BLOCKED', 'DONE'],
    ])('%s -> %s is rejected', (from, to) => {
      expect(isValidTransition(from, to)).toBe(false);
      const r = validateTransition(from, to);
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(/Invalid status transition/);
    });

    test('same-status no-op is rejected', () => {
      expect(isValidTransition('TODO', 'TODO')).toBe(false);
    });

    test('unknown statuses are rejected', () => {
      expect(isValidTransition('TODO', 'OOPS')).toBe(false);
      expect(isValidTransition('NOPE', 'DONE')).toBe(false);
    });
  });
});
