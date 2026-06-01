const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');

const requestLogger = require('./middleware/requestLogger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const routes = require('./routes');
const swaggerSpec = require('./docs/swagger');
const prisma = require('./config/prisma');
const { getRedis } = require('./config/redis');

const app = express();
app.disable('x-powered-by');

if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

const corsOrigin = process.env.CORS_ORIGIN;
app.use(helmet());
app.use(cors(corsOrigin ? { origin: corsOrigin.split(',').map((s) => s.trim()) } : {}));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
}));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/ready', async (req, res) => {
  const checks = { postgres: false, redis: false };
  try { await prisma.$queryRaw`SELECT 1`; checks.postgres = true; } catch (e) { void e; }
  try {
    const redis = getRedis();
    checks.redis = redis.status === 'ready' && (await redis.ping()) === 'PONG';
  } catch (e) { void e; }
  const ok = checks.postgres && checks.redis;
  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', checks });
});

app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
