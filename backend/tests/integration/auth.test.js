import { api, auth, login } from '../helpers.js';
import prisma from '../../src/config/prisma.js';

afterAll(() => prisma.$disconnect());

const uniqueLocalPhone = () => `068${String(Date.now()).slice(-7)}`; // 068XXXXXXX (local format)
const toE164 = (local) => `+255${local.slice(1)}`;

describe('authentication', () => {
  const email = `newfarmer${Date.now()}@example.com`;
  const phoneLocal = uniqueLocalPhone();
  const phone = toE164(phoneLocal);

  test('register requires consent, a phone and a strong password', async () => {
    const res = await api().post('/api/auth/register').send({ email, password: 'short', fullName: 'X', consent: false });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    const fields = res.body.error.details.map((d) => d.path || d.field || JSON.stringify(d)).join(' ');
    expect(fields).toMatch(/phone/);
    expect(fields).toMatch(/password/);
  });

  test('rejects phones that are not Tanzanian mobile numbers', async () => {
    const res = await api().post('/api/auth/register').send({ phone: '12345', password: 'Passw0rd!x', fullName: 'X', preferredLanguage: 'sw', consent: true });
    expect(res.status).toBe(400);
  });

  test('register (local phone format) → login by phone in any format → me', async () => {
    const reg = await api().post('/api/auth/register').send({ phone: phoneLocal, email, password: 'Passw0rd!x', fullName: 'Test Farmer', role: 'FARMER', preferredLanguage: 'en', cooperativeCode: 'PAJE', consent: true });
    expect(reg.status).toBe(201);
    expect(reg.body.data.user.roles).toEqual(['FARMER']);
    expect(reg.body.data.user.phone).toBe(phone);
    expect(reg.body.data.user.preferredLanguage).toBe('en');
    expect(reg.body.data.user).not.toHaveProperty('passwordHash');
    for (const identifier of [phone, phone.slice(1), phoneLocal, `0${phone.slice(4, 7)} ${phone.slice(7, 10)} ${phone.slice(10)}`, email]) {
      const log = await api().post('/api/auth/login').send({ identifier, password: 'Passw0rd!x' });
      expect([identifier, log.status]).toEqual([identifier, 200]);
    }
    const log = await api().post('/api/auth/login').send({ email, password: 'Passw0rd!x' }); // legacy field
    expect(log.status).toBe(200);
    const me = await api().get('/api/auth/me').set(auth(log.body.data.token));
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(email);
    expect(me.body.data.user).toMatchObject({ smsEnabled: true, notifyRiskAlerts: true, notifyHarvest: true, notifySystem: true });
    expect(me.body.data.memberships[0].code).toBe('PAJE');
    const stored = await prisma.user.findUnique({ where: { phone } });
    expect(stored.passwordHash.startsWith('$2')).toBe(true);
    expect(stored.consentGiven).toBe(true);
  });

  test('email is optional', async () => {
    const reg = await api().post('/api/auth/register').send({ phone: uniqueLocalPhone().replace(/^068/, '069'), password: 'Passw0rd!x', fullName: 'No Email', preferredLanguage: 'sw', consent: true });
    expect(reg.status).toBe(201);
    expect(reg.body.data.user.email).toBeNull();
  });

  test('duplicate phone (in another format) is rejected', async () => {
    const res = await api().post('/api/auth/register').send({ phone: phone.slice(1), password: 'Passw0rd!x', fullName: 'Dup', preferredLanguage: 'sw', consent: true });
    expect(res.status).toBe(409);
  });

  test('public registration cannot self-assign ADMIN', async () => {
    const res = await api().post('/api/auth/register').send({ phone: '0659000001', password: 'Passw0rd!x', fullName: 'Sneaky', role: 'ADMIN', consent: true });
    expect(res.status).toBe(400);
  });

  test('wrong password and bad/missing tokens are rejected', async () => {
    const bad = await api().post('/api/auth/login').send({ identifier: phone, password: 'wrongpass1' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('INVALID_CREDENTIALS');
    expect((await api().post('/api/auth/login').send({ identifier: '0700000000', password: 'wrongpass1' })).status).toBe(401);
    expect((await api().get('/api/auth/me')).status).toBe(401);
    expect((await api().get('/api/auth/me').set({ Authorization: 'Bearer nope' })).status).toBe(401);
  });

  test('language + notification preferences are saved in the database', async () => {
    const t = (await api().post('/api/auth/login').send({ identifier: phone, password: 'Passw0rd!x' })).body.data.token;
    const res = await api().patch('/api/auth/me').set(auth(t)).send({ preferredLanguage: 'sw', smsEnabled: false, notifyHarvest: false });
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ preferredLanguage: 'sw', smsEnabled: false, notifyHarvest: false, notifyRiskAlerts: true });
    const stored = await prisma.user.findUnique({ where: { phone } });
    expect(stored).toMatchObject({ preferredLanguage: 'sw', smsEnabled: false, notifyHarvest: false });
    // Phone changes are normalised and must stay unique.
    expect((await api().patch('/api/auth/me').set(auth(t)).send({ phone: '0777000001' })).status).toBe(409);
  });

  test('password change requires the current password', async () => {
    const t = (await api().post('/api/auth/login').send({ identifier: phone, password: 'Passw0rd!x' })).body.data.token;
    const wrong = await api().post('/api/auth/change-password').set(auth(t)).send({ currentPassword: 'nope', newPassword: 'NewPassw0rd' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('WRONG_PASSWORD');
    expect((await api().post('/api/auth/change-password').set(auth(t)).send({ currentPassword: 'Passw0rd!x', newPassword: 'weak' })).status).toBe(400);
    expect((await api().post('/api/auth/change-password').set(auth(t)).send({ currentPassword: 'Passw0rd!x', newPassword: 'NewPassw0rd1' })).status).toBe(200);
    expect((await api().post('/api/auth/login').send({ identifier: phone, password: 'Passw0rd!x' })).status).toBe(401);
    expect((await api().post('/api/auth/login').send({ identifier: phone, password: 'NewPassw0rd1' })).status).toBe(200);
  });

  test('demo accounts can log in', async () => {
    for (const role of ['farmer', 'cooperative', 'extension', 'buyer', 'admin']) {
      expect(await login(role)).toBeTruthy();
    }
  });
});
