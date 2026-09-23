import { badRequest } from '../utils/errors.js';

/** Validate req[part] with a zod schema and replace it with the parsed value (stored on req.valid). */
export const validate = (schema, part = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[part] ?? {});
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    return next(badRequest('Invalid input', details));
  }
  req.valid = { ...(req.valid || {}), [part]: result.data };
  return next();
};
