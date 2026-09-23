import { api, auth, login } from '../helpers.js';
import prisma from '../../src/config/prisma.js';

afterAll(() => prisma.$disconnect());

describe('authentication', () => {
  const email = `newfarmer${Date.now()}@example.com`;

  test('register requires consent and a strong password', async () => {
    const res = await api().post('/api/auth/register').send({ email, password: 'short', fullName: 'X', consent: false });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  test('register → login → me', async () => {
    const reg = await api().post('/api/auth/register').send({ email, password: 'Passw0rd!x', fullName: 'Test Farmer', role: 'FARMER', cooperativeCode: 'PAJE', consent: true });
    expect(reg.status).toBe(201);
    expect(reg.body.data.user.roles).toEqual(['FARMER']);
    expect(reg.body.data.user).not.toHaveProperty('passwordHash');
    const log = await api().post('/api/auth/login').send({ email, password: 'Passw0rd!x' });
    expect(log.status).toBe(200);
    const me = await api().get('/api/auth/me').set(auth(log.body.data.token));
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(email);
    expect(me.body.data.memberships[0].code).toBe('PAJE');
    const stored = await prisma.user.findUnique({ where: { email } });
    expect(stored.passwordHash).not.toBe('Passw0rd!x');
    expect(stored.passwordHash.startsWith('$2')).toBe(true);
    expect(stored.consentGiven).toBe(true);
  });

  test('duplicate registration is rejected', async () => {
    const res = await api().post('/api/auth/register').send({ email, password: 'Passw0rd!x', fullName: 'Dup', consent: true });
    expect(res.status).toBe(409);
  });

  test('public registration cannot self-assign ADMIN', async () => {
    const res = await api().post('/api/auth/register').send({ email: `x${Date.now()}@example.com`, password: 'Passw0rd!x', fullName: 'Sneaky', role: 'ADMIN', consent: true });
    expect(res.status).toBe(400);
  });

  test('wrong password and bad/missing tokens are rejected', async () => {
    expect((await api().post('/api/auth/login').send({ email, password: 'wrongpass1' })).status).toBe(401);
    expect((await api().get('/api/auth/me')).status).toBe(401);
    expect((await api().get('/api/auth/me').set({ Authorization: 'Bearer nope' })).status).toBe(401);
  });

  test('demo accounts can log in', async () => {
    for (const role of ['farmer', 'cooperative', 'extension', 'buyer', 'admin']) {
      expect(await login(role)).toBeTruthy();
    }
  });
});
