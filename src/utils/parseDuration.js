const UNIT_MS = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

module.exports = function parseDuration(input) {
  if (typeof input === 'number') return input;
  const m = /^(\d+)(ms|s|m|h|d)$/.exec(String(input).trim());
  if (!m) throw new Error(`Cannot parse duration: ${input}`);
  return Number(m[1]) * UNIT_MS[m[2]];
};
