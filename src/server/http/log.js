import { env } from '../config/env.js';

// Never write query-string secrets (e.g. the Africa's Talking callback ?secret=) to access logs.
export const redactUrl = (url) => url.replace(/([?&](?:key|token|apiKey|secret)=)[^&]*/gi, '$1[REDACTED]');

export function logRequest(ctx, response, startedMs) {
  if (env.isTest) return;
  const ms = (performance.now() - startedMs).toFixed(1);
  console.log(`[api] ${ctx.method} ${redactUrl(ctx.originalUrl)} ${response.status} ${ms} ms`);
}
