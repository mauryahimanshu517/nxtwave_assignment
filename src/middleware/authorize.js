const AppError = require('../utils/AppError');

module.exports = function authorize(...allowedRoles) {
  if (!allowedRoles.length) throw new Error('authorize() requires at least one role');
  const allowed = new Set(allowedRoles);

  return (req, res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!allowed.has(req.user.role)) {
      return next(AppError.forbidden(`Requires role: ${allowedRoles.join(' or ')}`));
    }
    return next();
  };
};
