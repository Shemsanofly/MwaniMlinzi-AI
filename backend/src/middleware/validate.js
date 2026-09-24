import { badRequest } from '../utils/errors.js';

/**
 * Validate req[part] with a zod schema; the parsed value is stored on req.valid[part].
 * `partial: true` is for PATCH-style updates: zod's `.partial()` still applies `.default()` values,
 * so only keys the client actually sent are kept (otherwise omitted fields would be reset).
 */
export const validate = (schema, part = 'body', { partial = false } = {}) => (req, _res, next) => {
  const input = req[part] ?? {};
  const result = schema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    return next(badRequest('Invalid input', details));
  }
  let data = result.data;
  if (partial && data && typeof data === 'object') {
    data = Object.fromEntries(Object.entries(data).filter(([k]) => Object.prototype.hasOwnProperty.call(input, k)));
  }
  req.valid = { ...(req.valid || {}), [part]: data };
  return next();
};
