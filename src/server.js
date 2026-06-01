const app = require('./app');
const env = require('./config/env');
const logger = require('./utils/logger');
const prisma = require('./config/prisma');
const { getRedis } = require('./config/redis');

getRedis();

const server = app.listen(env.port, () => {
  logger.info('server.listening', { port: env.port, env: env.nodeEnv });
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('server.shutdown', { signal });

  server.close(async () => {
    try { await prisma.$disconnect(); }
    catch (err) { logger.error('prisma.disconnect_failed', { error: err.message }); }
    try { await getRedis().quit(); }
    catch (err) { logger.error('redis.quit_failed', { error: err.message }); }
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.error('unhandled_rejection', { reason: String(reason) });
});
