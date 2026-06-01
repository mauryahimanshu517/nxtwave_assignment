const AppError = require('../utils/AppError');

function flatten(zodError) {
  const { fieldErrors, formErrors } = zodError.flatten();
  return formErrors.length ? { ...fieldErrors, _form: formErrors } : fieldErrors;
}

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw AppError.badRequest('Validation failed', flatten(result.error));
  return result.data;
}

module.exports = function validate({ body, query, params } = {}) {
  return (req, res, next) => {
    try {
      if (body)   req.body = parse(body, req.body);
      if (params) req.params = parse(params, req.params);
      if (query) {
        Object.defineProperty(req, 'validatedQuery', {
          value: parse(query, req.query),
          configurable: true,
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};
