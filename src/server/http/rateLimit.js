import { env } from '../config/env.js';

/** Fixed-window in-memory limiter, equivalent to express-rate-limit's MemoryStore with draft-7 headers. */
export function createLimiter({ windowMs, limit, text, now = Date.now, isTest = env.isTest }) {
  const hits = new Map();
  let nextSweep = 0;
  const max = isTest ? 100000 : limit;
  function rateLimitStep(ctx) {
    const t = now();
    if (t >= nextSweep) {
      for (const [ip, e] of hits) if (e.resetAt <= t) hits.delete(ip);
      nextSweep = t + windowMs;
    }
    let entry = hits.get(ctx.ip);
    if (!entry || t >= entry.resetAt) { entry = { count: 0, resetAt: t + windowMs }; hits.set(ctx.ip, entry); }
    entry.count += 1;
    const reset = Math.max(0, Math.ceil((entry.resetAt - t) / 1000));
    const headers = {
      'RateLimit-Policy': `${max};w=${Math.round(windowMs / 1000)}`,
      RateLimit: `limit=${max}, remaining=${Math.max(0, max - entry.count)}, reset=${reset}`,
    };
    if (entry.count > max) {
      const init = { status: 429, headers: { ...headers, 'Retry-After': String(reset) } };
      return text
        ? new Response(text, { ...init, headers: { ...init.headers, 'Content-Type': 'text/plain; charset=utf-8' } })
        : Response.json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down.' } }, init);
    }
    for (const [k, v] of Object.entries(headers)) ctx.responseHeaders.set(k, v);
    return undefined;
  }
  rateLimitStep.size = () => hits.size; // test-only
  return rateLimitStep;
}

export const limiters = {
  api: createLimiter({ windowMs: 15 * 60 * 1000, limit: 1500 }),
  auth: createLimiter({ windowMs: 15 * 60 * 1000, limit: 30 }),
  ai: createLimiter({ windowMs: 60 * 1000, limit: 30 }),
  location: createLimiter({ windowMs: 60 * 1000, limit: 20 }),
  /** Africa's Talking callbacks: generous (all traffic comes from AT's IPs) but bounded. */
  integration: createLimiter({ windowMs: 60 * 1000, limit: 300, text: 'END Too many requests. Please try again later.' }),
};
