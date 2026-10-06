import { createContext } from '../../../src/server/http/context.js';

describe('createContext', () => {
  test('exposes Express-like request fields', () => {
    const req = new Request('http://localhost/api/ussd/MwaniMlinzi?secret=a&tag=x&tag=y', {
      method: 'POST', headers: { 'X-Callback-Secret': 's', 'x-forwarded-for': '10.0.0.1, 41.2.3.4' },
    });
    const ctx = createContext(req, { id: '7' });
    expect(ctx.method).toBe('POST');
    expect(ctx.path).toBe('/api/ussd/MwaniMlinzi');
    expect(ctx.originalUrl).toBe('/api/ussd/MwaniMlinzi?secret=a&tag=x&tag=y');
    expect(ctx.query).toEqual({ secret: 'a', tag: ['x', 'y'] });
    expect(ctx.params).toEqual({ id: '7' });
    expect(ctx.get('x-callback-secret')).toBe('s');
    expect(ctx.get('missing')).toBeUndefined();
    expect(ctx.headers['x-callback-secret']).toBe('s');
    expect(ctx.ip).toBe('41.2.3.4'); // trust proxy 1 → last hop
    expect(ctx.body).toBeUndefined();
  });

  test('falls back to x-real-ip, then 127.0.0.1', () => {
    expect(createContext(new Request('http://l/api', { headers: { 'x-real-ip': '1.2.3.4' } }), {}).ip).toBe('1.2.3.4');
    expect(createContext(new Request('http://l/api'), {}).ip).toBe('127.0.0.1');
  });
});
