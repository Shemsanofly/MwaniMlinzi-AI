import { api, auth, login } from '../helpers.js';

describe('Express-equivalent fallbacks', () => {
  test('unknown /api path without a token → 401 (global authenticate ran first)', async () => {
    const res = await api().get('/api/does-not-exist');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
  test('unknown /api path with a token → 404 Route … not found', async () => {
    const res = await api().get('/api/does-not-exist?x=1').set(auth(await login('farmer')));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: { code: 'NOT_FOUND', message: 'Route GET /api/does-not-exist?x=1 not found' } });
  });
  test('unknown /api/admin path for a farmer → 403', async () => {
    const res = await api().get('/api/admin/nothing').set(auth(await login('farmer')));
    expect(res.status).toBe(403);
  });
  test('wrong method on a known public path → 401 without token', async () => {
    expect((await api().delete('/api/health')).status).toBe(401);
  });
  test('GET /api banner and docs', async () => {
    expect((await api().get('/api')).body.data.name).toBe('MwaniMlinzi AI API');
    expect((await api().get('/api/docs.json')).body.openapi).toBeDefined();
    const docs = await api().get('/api/docs');
    expect(docs.status).toBe(200);
    expect(docs.text).toContain('swagger-ui');
  });
});
