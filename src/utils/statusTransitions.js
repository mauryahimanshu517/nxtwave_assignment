const ALLOWED = {
  TODO:        new Set(['IN_PROGRESS', 'BLOCKED']),
  IN_PROGRESS: new Set(['IN_REVIEW', 'BLOCKED']),
  IN_REVIEW:   new Set(['DONE', 'BLOCKED']),
  DONE:        new Set([]),
  BLOCKED:     new Set(['TODO']),
};

function isValidTransition(from, to) {
  return from !== to && ALLOWED[from]?.has(to) === true;
}

function validateTransition(from, to) {
  return isValidTransition(from, to)
    ? { ok: true }
    : { ok: false, message: `Invalid status transition: ${from} -> ${to}` };
}

module.exports = { ALLOWED, isValidTransition, validateTransition };
