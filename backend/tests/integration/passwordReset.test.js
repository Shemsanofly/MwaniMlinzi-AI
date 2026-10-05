import bcrypt from 'bcryptjs';
import { events } from '../../src/db/records.js';
import { api } from '../helpers.js';
import prisma from '../../src/config/prisma.js';
import { getEmailProvider, setEmailProvider } from '../../src/services/emailService.js';
import { getSMSClient, setSMSClient } from '../../src/services/smsService.js';
import { FakeEmailProvider } from '../fakes/emailProvider.js';
import { FakeSMSClient } from '../fakes/smsClient.js';

const fake = new FakeEmailProvider();
const sms = new FakeSMSClient();
let originalEmail, originalSMS, userId;
const suffix = String(Date.now()).slice(-6);
const PHONE = `0689${suffix}`;
const EMAIL = `reset-${suffix}@example.test`;
const PASSWORD = 'Passw0rd!old';
const codeFrom = (message) => message.match(/\b(\d{6})\b/)[1];
const requestCode = () => api().post('/api/auth/forgot-password').send({ email: EMAIL });
const resetCode = (code, email = EMAIL) => api().post('/api/auth/reset-password').send({ email, code, newPassword: 'Newpass123' });
const latestCode = () => codeFrom(fake.to(EMAIL).at(-1).text);

beforeAll(async () => {
  originalEmail = getEmailProvider(); originalSMS = getSMSClient();
  setEmailProvider(fake); setSMSClient(sms);
  const reg = await api().post('/api/auth/register').send({ email: EMAIL, phone: PHONE, password: PASSWORD, fullName: 'Reset Tester', preferredLanguage: 'sw', consent: true });
  expect(reg.status).toBe(201);
  userId = (await prisma.user.findUnique({ where: { email: EMAIL } })).id;
});
beforeEach(async () => {
  fake.configured = true; fake.nextStatus = 'SENT'; fake.sent = [];
  await prisma.passwordReset.deleteMany({ where: { userId } });
});
afterAll(async () => {
  setEmailProvider(originalEmail); setSMSClient(originalSMS);
  await prisma.$disconnect();
});

describe('password reset by registered email', () => {
  test('reports unavailable email configuration without pretending to send', async () => {
    fake.configured = false;
    const r = await requestCode();
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('EMAIL_NOT_CONFIGURED');
    expect(fake.sent).toHaveLength(0);
    expect(await prisma.passwordReset.count({ where: { userId } })).toBe(0);
  });
  test('unknown and disabled emails receive the same success reply without delivery', async () => {
    const unknown = await api().post('/api/auth/forgot-password').send({ email: 'unknown@example.test' });
    await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    try {
      const disabled = await requestCode();
      expect(disabled.status).toBe(200);
      expect(disabled.body).toEqual(unknown.body);
      expect(fake.sent).toHaveLength(0);
    } finally {
      await prisma.user.update({ where: { id: userId }, data: { isActive: true } });
    }
    expect((await requestCode()).body).toEqual(unknown.body);
  });
  test('rejects invalid emails and the former phone-only API', async () => {
    for (const body of [{ phone: PHONE }, { email: 'invalid' }]) {
      expect((await api().post('/api/auth/forgot-password').send(body)).status).toBe(400);
      expect((await api().post('/api/auth/reset-password').send({ ...body, code: '123456', newPassword: 'Newpass123' })).status).toBe(400);
    }
    expect(fake.sent).toHaveLength(0);
  });
  test('emails a six-digit code in the account language; logs and API never expose it', async () => {
    const r = await api().post('/api/auth/forgot-password').send({ email: `  ${EMAIL.toUpperCase()}  ` });
    expect(r.status).toBe(200);
    const email = fake.to(EMAIL).at(-1);
    expect(email.text).toMatch(/^Namba yako ya kubadilisha nenosiri la MwaniMlinzi ni \d{6}\./);
    const code = codeFrom(email.text);
    expect(JSON.stringify(r.body)).not.toContain(code);
    const log = await events(prisma, 'DELIVERY').findFirst({ where: { recipient: EMAIL, messageType: 'PASSWORD_RESET' }, orderBy: { createdAt: 'desc' } });
    expect(log.channel).toBe('EMAIL');
    expect(log.message).not.toContain(code);
    expect(log.message).toContain('******');
    const row = await prisma.passwordReset.findFirst({ where: { userId } });
    expect(row.codeHash).not.toBe(code);
    expect(await bcrypt.compare(code, row.codeHash)).toBe(true);
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeGreaterThan(14 * 60 * 1000);
    expect(sms.sent).toHaveLength(0);
  });
  test('wrong or cross-account codes cannot change passwords; a valid code works only once', async () => {
    await requestCode();
    const code = latestCode();
    const wrong = code === '000000' ? '111111' : '000000';
    expect((await resetCode(wrong)).body.error.code).toBe('INVALID_CODE');
    expect((await resetCode(code, 'unknown@example.test')).status).toBe(400);
    expect((await api().post('/api/auth/reset-password').send({ email: EMAIL, code, newPassword: 'short' })).status).toBe(400);
    expect((await resetCode(code, EMAIL.toUpperCase())).status).toBe(200);
    expect((await api().post('/api/auth/login').send({ identifier: EMAIL, password: 'Newpass123' })).status).toBe(200);
    expect((await api().post('/api/auth/login').send({ identifier: PHONE, password: PASSWORD })).status).toBe(401);
    expect((await resetCode(code)).status).toBe(400);
  });
  test('expired codes are rejected', async () => {
    await requestCode();
    const code = latestCode();
    await prisma.passwordReset.updateMany({ where: { userId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await resetCode(code)).body.error.code).toBe('INVALID_CODE');
  });
  test('five concurrent wrong attempts lock the code without losing increments', async () => {
    await requestCode();
    const code = latestCode();
    const wrong = code === '000000' ? '111111' : '000000';
    const replies = await Promise.all(Array.from({ length: 5 }, () => resetCode(wrong)));
    expect(replies.every((reply) => reply.status === 400)).toBe(true);
    const row = await prisma.passwordReset.findFirst({ where: { userId } });
    expect(row.attempts).toBe(5);
    expect(row.usedAt).not.toBeNull();
    expect((await resetCode(code)).body.error.code).toBe('INVALID_CODE');
  });
  test('concurrent submissions can consume a correct code only once', async () => {
    await requestCode();
    const code = latestCode();
    const replies = await Promise.all([resetCode(code), resetCode(code)]);
    expect(replies.map((reply) => reply.status).sort()).toEqual([200, 400]);
  });
  test('resending invalidates older codes and limits deliveries to three per 15 minutes', async () => {
    await requestCode();
    const oldCode = latestCode();
    await requestCode();
    const rows = await prisma.passwordReset.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
    expect(rows[0].usedAt).not.toBeNull();
    expect(rows[1].usedAt).toBeNull();
    if (oldCode !== latestCode()) expect((await resetCode(oldCode)).status).toBe(400);
    await requestCode();
    expect((await requestCode()).status).toBe(200);
    expect(fake.sent).toHaveLength(3);
    expect((await resetCode(latestCode())).status).toBe(200);
  });
  test('a delivery failure is reported and its code is invalidated', async () => {
    fake.nextStatus = 'FAILED';
    const r = await requestCode();
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe('EMAIL_SEND_FAILED');
    expect((await resetCode(latestCode())).status).toBe(400);
  });
});
