/** Request-shaped context handed to steps and controllers as `req` (the fields controllers used on Express's req). */
export function parseQuery(searchParams) {
  const query = {};
  for (const [key, value] of searchParams) {
    if (!Object.hasOwn(query, key)) query[key] = value;
    else query[key] = [].concat(query[key], value); // Express 5 "simple" parser: repeated keys → array
  }
  return query;
}

/** Express `trust proxy 1`: the client is the last X-Forwarded-For hop. */
export function clientIp(headers) {
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const hops = xff.split(',').map((s) => s.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return headers.get('x-real-ip') || '127.0.0.1';
}

export function createContext(request, params = {}) {
  const url = new URL(request.url);
  const headers = Object.fromEntries([...request.headers].map(([k, v]) => [k.toLowerCase(), v]));
  return {
    request,
    method: request.method,
    path: url.pathname,
    originalUrl: `${url.pathname}${url.search}`,
    params,
    query: parseQuery(url.searchParams),
    headers,
    get: (name) => request.headers.get(name) ?? undefined,
    ip: clientIp(request.headers),
    body: undefined,
    valid: undefined,
    user: undefined,
    file: undefined,
    responseHeaders: new Headers(),
  };
}
