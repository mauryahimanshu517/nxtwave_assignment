const Redis = require('ioredis');
const env = require('./env');
const logger = require('../utils/logger');

let client;

function getRedis() {
  if (client) return client;

  client = new Redis(env.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });

  client.on('connect', () => logger.info('redis.connected'));
  client.on('error', (err) => logger.error('redis.error', { error: err.message }));
  client.on('end', () => logger.warn('redis.disconnected'));

  client.connect().catch((err) => {
    logger.warn('redis.initial_connect_failed', { error: err.message });
  });

  return client;
}

module.exports = { getRedis };
