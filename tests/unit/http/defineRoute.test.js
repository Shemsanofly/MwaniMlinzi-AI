import { defineRoute } from '../../../src/server/http/defineRoute.js';
import { badRequest } from '../../../src/server/utils/errors.js';
import { ok } from '../../../src/server/utils/response.js';

const call = (handler, url, init = {}, params = {}) => handler(new Request(`http://localhost${url}`, init), { params: Promise.resolve(params) });

describe('defineRoute', () => {
  test('runs steps in order, then the controller with (req, res)', async () => {
    const order = [];
    const h = defineRoute([() => { order.push('a'); }, (req) => { order.push('b'); req.user = { id: 'u' }; }], (req, res) => ok(res, { id: req.params.id, user: req.user.id, body: req.body }));
    const r = await call(h, '/api/x/9', { method: 'POST', body: '{"n":1}', headers: { 'content-type': 'application/json' } }, { id: '9' });
    expect(order).toEqual(['a', 'b']);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ success: true, data: { id: '9', user: 'u', body: { n: 1 } }, message: 'OK' });
  });

  test('a step returning a Response short-circuits', async () => {
    const h = defineRoute([() => new Response('no', { status: 429 })], () => { throw new Error('should not run'); });
    expect((await call(h, '/api/x')).status).toBe(429);
  });

  test('thrown AppError → error JSON', async () => {
    const h = defineRoute([], () => { throw badRequest('Nope'); });
    const r = await call(h, '/api/x');
    expect(r.status).toBe(400);
    expect((await r.json()).error.message).toBe('Nope');
  });

  test('malformed JSON is rejected before steps run', async () => {
    let ran = false;
    const h = defineRoute([() => { ran = true; }], () => {});
    const r = await call(h, '/api/x', { method: 'POST', body: '{bad', headers: { 'content-type': 'application/json' } });
    expect(r.status).toBe(400);
    expect(ran).toBe(false);
  });

  test('security headers, CORS for allowed origin, step headers', async () => {
    const h = defineRoute([(req) => { req.responseHeaders.set('RateLimit', 'limit=1, remaining=0, reset=1'); }], (_req, res) => ok(res));
    const r = await call(h, '/api/x', { headers: { origin: 'http://localhost:5173' } });
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(r.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    expect(r.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(r.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(r.headers.get('vary')).toContain('Origin');
    expect(r.headers.get('ratelimit')).toBe('limit=1, remaining=0, reset=1');
  });

  test('disallowed origin gets no CORS header but the request still runs', async () => {
    const h = defineRoute([], (_req, res) => ok(res));
    const r = await call(h, '/api/x', { headers: { origin: 'https://evil.example' } });
    expect(r.status).toBe(200);
    expect(r.headers.get('access-control-allow-origin')).toBeNull();
  });
});
