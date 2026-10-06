import { env } from '../config/env.js';
import { isAllowedOrigin } from '../config/cors.js';

/** helmet() v8 defaults with crossOriginResourcePolicy: 'cross-origin' (as the Express app used). */
export const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';script-src-attr 'none';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'Origin-Agent-Cluster': '?1',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-DNS-Prefetch-Control': 'off',
  'X-Download-Options': 'noopen',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'X-XSS-Protection': '0',
};

export function applySecurityHeaders(headers) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!headers.has(k)) headers.set(k, v);
}

/** cors({ origin: isAllowedOrigin, credentials: false }) for simple requests. */
export function applyCors(request, headers) {
  const origin = request.headers.get('origin');
  headers.append('Vary', 'Origin');
  if (origin && isAllowedOrigin(origin, env)) headers.set('Access-Control-Allow-Origin', origin);
}

/** Headers a CORS-enabled response needs for this request (interface helper). */
export function corsHeaders(request) {
  const headers = new Headers();
  applyCors(request, headers);
  return headers;
}

/** cors() preflight: 204 with methods/headers; ACAO only for allowed origins. */
export function preflight(request) {
  const headers = new Headers({ 'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE', 'Content-Length': '0' });
  applyCors(request, headers);
  const asked = request.headers.get('access-control-request-headers');
  if (asked) { headers.set('Access-Control-Allow-Headers', asked); headers.append('Vary', 'Access-Control-Request-Headers'); }
  applySecurityHeaders(headers);
  return new Response(null, { status: 204, headers });
}
