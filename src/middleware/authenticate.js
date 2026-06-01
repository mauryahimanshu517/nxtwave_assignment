const AppError = require('../utils/AppError');
const { verifyAccessToken } = require('../utils/jwt');
const logger = require('../utils/logger');

module.exports = function authenticate(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(AppError.unauthorized('Missing or malformed Authorization header'));
  }

  try {
    const decoded = verifyAccessToken(token);
    req.user = {
      id: decoded.sub,
      organizationId: decoded.organizationId,
      role: decoded.role,
      email: decoded.email,
    };
    return next();
  } catch (err) {
    logger.warn('auth.access_token_invalid', { reason: err.message, path: req.originalUrl });
    return next(
      err.name === 'TokenExpiredError'
        ? AppError.unauthorized('Access token expired')
        : AppError.unauthorized('Invalid access token'),
    );
  }
};
