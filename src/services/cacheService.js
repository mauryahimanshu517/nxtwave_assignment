const crypto = require('crypto');
const { getRedis } = require('../config/redis');
const env = require('../config/env');
const logger = require('../utils/logger');

function sortObject(v) {
  if (Array.isArray(v)) return v.map(sortObject);
  if (v && typeof v === 'object') {
    return Object.keys(v).sort().reduce((a, k) => ((a[k] = sortObject(v[k])), a), {});
  }
  return v;
}

function buildTaskListKey({ organizationId, assigneeId, filters }) {
  const hash = crypto
    .createHash('sha1')
    .update(JSON.stringify(sortObject(filters || {})))
    .digest('hex')
    .slice(0, 16);
  return `tasks:${organizationId}:${assigneeId || 'all'}:${hash}`;
}

const indexKey = (organizationId, assigneeId) =>
  `idx:tasks:${organizationId}:${assigneeId || 'all'}`;

async function withRedis(fn, fallback) {
  try {
    const redis = getRedis();
    if (redis.status !== 'ready') return fallback;
    return await fn(redis);
  } catch (err) {
    logger.warn('cache.error', { error: err.message });
    return fallback;
  }
}

async function getTaskList(key) {
  return withRedis(async (redis) => {
    const cached = await redis.get(key);
    if (!cached) {
      logger.info('cache.miss', { key });
      return null;
    }
    logger.info('cache.hit', { key });
    return JSON.parse(cached);
  }, null);
}

async function setTaskList(key, value, { organizationId, assigneeId }) {
  return withRedis(async (redis) => {
    await redis
      .multi()
      .set(key, JSON.stringify(value), 'EX', env.cache.taskListTtlSeconds)
      .sadd(indexKey(organizationId, assigneeId), key)
      .expire(indexKey(organizationId, assigneeId), env.cache.taskListTtlSeconds + 60)
      .exec();
  }, null);
}

async function invalidateBucket(organizationId, assigneeId) {
  return withRedis(async (redis) => {
    const idx = indexKey(organizationId, assigneeId);
    const keys = await redis.smembers(idx);
    if (keys.length) await redis.del(keys);
    await redis.del(idx);
    logger.info('cache.invalidated', { organizationId, assigneeId, count: keys.length });
  }, null);
}

async function invalidateTaskCache(organizationId, assigneeIds = []) {
  const buckets = new Set([null, ...assigneeIds.filter(Boolean)]);
  for (const id of buckets) await invalidateBucket(organizationId, id);
}

module.exports = { buildTaskListKey, getTaskList, setTaskList, invalidateTaskCache };
