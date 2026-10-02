import { events } from '../../src/db/records.js';
import { api } from '../helpers.js';
import prisma from '../../src/config/prisma.js';
import { getSMSClient, setSMSClient } from '../../src/services/smsService.js';
import { FakeSMSClient } from '../fakes/smsClient.js';

afterAll(() => prisma.$disconnect());

const fake = new FakeSMSClient();
let original;
beforeAll(() => { original = getSMSClient(); setSMSClient(fake); });
afterAll(() => setSMSClient(original));

const suffix = String(Date.now()).slice(-6);
const PHONE_LOCAL = `0689${suffix}`;
const PHONE = `+255689${suffix}`;
const PASSWORD = 'Passw0rd!old';

const codeFrom = (msg) => msg.match(/\b(\d{6})\b/)[1];

describe('password reset by SMS code', () => {
  beforeAll(async () => {
    const reg = await api().post('/api/auth/register').send({ phone: PHONE_LOCAL, password: PASSWORD, fullName: 'Reset Tester', preferredLanguage: 'sw', consent: true });
    expect(reg.status).toBe(201);
  });

  test('says NOT_CONFIGURED instead of pretending when SMS is not set up', async () => {
    fake.configured = false;
    try {
      const r = await api().post('/api/auth/forgot-password').send({ phone: PHONE_LOCAL });
      expect(r.status).toBe(503);
      expect(r.body.error.code).toBe('NOT_CONFIGURED');
      expect(fake.to(PHONE)).toHaveLength(0);
    } finally {
      fake.configured = true;
    }
  });

  test('unknown numbers get the same answer and no SMS (no account enumeration)', async () => {
    const r = await api().post('/api/auth/forgot-password').send({ phone: '0689000999' });
    expect(r.status).toBe(200);
    expect(fake.to('+255689000999')).toHaveLength(0);
    expect((await api().post('/api/auth/forgot-password').send({ phone: 'abc' })).status).toBe(400);
  });

  test('sends a 6-digit code in the user language; the code is never stored in clear text', async () => {
    const r = await api().post('/api/auth/forgot-password').send({ phone: PHONE_LOCAL });
    expect(r.status).toBe(200);
    const sms = fake.to(PHONE).at(-1).message;
    expect(sms).toMatch(/^MWANIMLINZI: Namba yako ya kubadilisha nenosiri ni \d{6}\./);
    const code = codeFrom(sms);
    const log = await events(prisma, 'DELIVERY').findFirst({ where: { recipient: PHONE, messageType: 'PASSWORD_RESET' }, orderBy: { createdAt: 'desc' } });
    expect(log.message).not.toContain(code);
    expect(log.message).toContain('******');
    const row = await prisma.passwordReset.findFirst({ where: { user: { phone: PHONE } }, orderBy: { createdAt: 'desc' } });
    expect(row.codeHash).not.toContain(code);
  });

  test('wrong codes are refused and count as attempts; the right code sets the new password once', async () => {
    await api().post('/api/auth/forgot-password').send({ phone: PHONE_LOCAL });
    const code = codeFrom(fake.to(PHONE).at(-1).message);
    const wrong = code === '000000' ? '111111' : '000000';

    const bad = await api().post('/api/auth/reset-password').send({ phone: PHONE_LOCAL, code: wrong, newPassword: 'Newpass123' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_CODE');
    const weak = await api().post('/api/auth/reset-password').send({ phone: PHONE_LOCAL, code, newPassword: 'short' });
    expect(weak.status).toBe(400);

    const ok = await api().post('/api/auth/reset-password').send({ phone: `+255689${suffix}`, code, newPassword: 'Newpass123' });
    expect(ok.status).toBe(200);
    expect((await api().post('/api/auth/login').send({ identifier: PHONE_LOCAL, password: 'Newpass123' })).status).toBe(200);
    expect((await api().post('/api/auth/login').send({ identifier: PHONE_LOCAL, password: PASSWORD })).status).toBe(401);
    // A used code cannot be reused.
    expect((await api().post('/api/auth/reset-password').send({ phone: PHONE_LOCAL, code, newPassword: 'Another123' })).status).toBe(400);
  });

  test('a code is locked after five wrong attempts', async () => {
    await prisma.passwordReset.deleteMany({ where: { user: { phone: PHONE } } });
    await api().post('/api/auth/forgot-password').send({ phone: PHONE_LOCAL });
    const code = codeFrom(fake.to(PHONE).at(-1).message);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await api().post('/api/auth/reset-password').send({ phone: PHONE_LOCAL, code: wrong, newPassword: 'Newpass456' });
    const r = await api().post('/api/auth/reset-password').send({ phone: PHONE_LOCAL, code, newPassword: 'Newpass456' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('INVALID_CODE');
  });

  test('a provider failure is reported, not hidden', async () => {
    await prisma.passwordReset.deleteMany({ where: { user: { phone: PHONE } } });
    fake.nextStatus = 'FAILED';
    try {
      const r = await api().post('/api/auth/forgot-password').send({ phone: PHONE_LOCAL });
      expect(r.status).toBe(502);
      expect(r.body.error.code).toBe('PROVIDER_ERROR');
    } finally {
      fake.nextStatus = 'QUEUED';
    }
  });
});
