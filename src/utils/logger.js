const fs = require('fs');
const path = require('path');
const winston = require('winston');

const isTest = process.env.NODE_ENV === 'test';
const isProd = process.env.NODE_ENV === 'production';

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

const pretty = printf(({ level, message, timestamp: ts, ...meta }) => {
  const m = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${ts} [${level}] ${message}${m}`;
});

const transports = [];

if (!isTest) {
  const logsDir = path.resolve(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
  );
}

if (!isProd && !isTest) {
  transports.push(new winston.transports.Console({
    format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), pretty),
  }));
}

if (isTest) {
  transports.push(new winston.transports.Console({ silent: true }));
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(timestamp(), errors({ stack: true }), json()),
  defaultMeta: { service: 'task-tracker-api' },
  transports,
});

module.exports = logger;
