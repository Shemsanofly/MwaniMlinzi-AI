export function pageParams(query, defaults = { limit: 50, max: 200 }) {
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaults.limit, 1), defaults.max);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  return { take: limit, skip: (page - 1) * limit, page, limit };
}
