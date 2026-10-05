import { createLimiter } from '../../../src/server/http/rateLimit.js';
import { createContext } from '../../../src/server/http/context.js';

const ctx = (ip = '1.1.1.1') => createContext(new Request('http://l/api/x', { headers: { 'x-forwarded-for': ip } }), {});

describe('createLimiter', () => {
  test('allows `limit` hits per window per IP, then 429 JSON with draft-7 headers', async () => {
    let now = 0;
    const step = createLimiter({ windowMs: 1000, limit: 2, now: () => now, isTest: false });
    expect(step(ctx())).toBeUndefined();
    const second = ctx();
    expect(step(second)).toBeUndefined();
    expect(second.responseHeaders.get('RateLimit')).toBe('limit=2, remaining=0, reset=1');
    expect(second.responseHeaders.get('RateLimit-Policy')).toBe('2;w=1');
    const blocked = step(ctx());
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down.' } });
    expect(step(ctx('2.2.2.2'))).toBeUndefined(); // other client unaffected
    now = 1001;
    expect(step(ctx())).toBeUndefined(); // window reset
  });

  test("plain-text variant for Africa's Talking", async () => {
    const step = createLimiter({ windowMs: 1000, limit: 0, text: 'END Too many requests. Please try again later.', isTest: false });
    const r = step(ctx());
    expect(r.status).toBe(429);
    expect(r.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await r.text()).toBe('END Too many requests. Please try again later.');
  });
});
