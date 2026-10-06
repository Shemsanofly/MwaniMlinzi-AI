import { api, auth, login } from '../helpers.js';
import prisma from '../../src/server/config/prisma.js';

afterAll(() => prisma.$disconnect());

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
  test('docs assets are served with the right content types', async () => {
    for (const name of ['swagger-ui-bundle.js', 'swagger-initializer.js']) {
      const res = await api().get(`/api/docs/${name}`);
      expect(res.status).toBe(200);
      expect(res.type).toMatch(/javascript/);
      expect(res.text.length).toBeGreaterThan(0);
    }
    const css = await api().get('/api/docs/swagger-ui.css');
    expect(css.status).toBe(200);
    expect(css.type).toBe('text/css');
  });
  test('bare /api/admin for a farmer → 403', async () => {
    expect((await api().get('/api/admin').set(auth(await login('farmer')))).status).toBe(403);
  });
  test('wrong method on an integration path without a token → 401', async () => {
    expect((await api().get('/api/integrations/africastalking/ussd')).status).toBe(401);
  });
});
