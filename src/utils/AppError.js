class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }

  static badRequest(message, details)              { return new AppError(400, 'VALIDATION_ERROR', message, details); }
  static unauthorized(message = 'Unauthorized')    { return new AppError(401, 'UNAUTHORIZED', message); }
  static forbidden(message = 'Forbidden')          { return new AppError(403, 'FORBIDDEN', message); }
  static notFound(message = 'Not found')           { return new AppError(404, 'NOT_FOUND', message); }
  static conflict(message)                         { return new AppError(409, 'CONFLICT', message); }
  static server(message = 'Internal server error') { return new AppError(500, 'SERVER_ERROR', message); }
}

module.exports = AppError;
