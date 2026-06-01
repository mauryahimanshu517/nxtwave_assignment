const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { Prisma } = require('@prisma/client');
const { ZodError } = require('zod');

function notFoundHandler(req, res, next) {
  next(AppError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

function toAppError(err) {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) return AppError.badRequest('Validation failed', err.flatten().fieldErrors);
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return AppError.conflict('A record with these unique fields already exists');
    if (err.code === 'P2025') return AppError.notFound('Record not found');
    return AppError.server('Database error');
  }
  if (err.type === 'entity.parse.failed') return AppError.badRequest('Malformed JSON body');
  return AppError.server('Internal server error');
}

function errorHandler(err, req, res, next) {
  void next;
  const appErr = toAppError(err);

  if (appErr.status >= 500) {
    logger.error('unhandled_error', {
      message: err.message,
      stack: err.stack,
      path: req.originalUrl,
      method: req.method,
    });
  } else {
    logger.warn('request_error', {
      code: appErr.code,
      message: appErr.message,
      path: req.originalUrl,
      method: req.method,
    });
  }

  const body = { status: appErr.status, code: appErr.code, message: appErr.message };
  if (appErr.details) body.details = appErr.details;
  res.status(appErr.status).json(body);
}

module.exports = { errorHandler, notFoundHandler };
