import { events } from '../../src/db/records.js';
import { api } from '../helpers.js';
import prisma from '../../src/config/prisma.js';
import { RiskService } from '../../src/services/riskService.js';

afterAll(() => prisma.$disconnect());

const SECRET = 'test-sarufi-secret';
const PHONE = '+255777000001'; // an existing seeded farmer, same one channels.test.js uses

const post = (body, { secret = SECRET } = {}) => api()
  .post(`/api/integrations/sarufi/webhook${secret ? `?secret=${secret}` : ''}`)
  .type('json')
  .send(body);

describe('Sarufi WhatsApp webhook', () => {
  test('GET health probe: 403 without secret, 200 with secret', async () => {
    expect((await api().get('/api/integrations/sarufi/webhook')).status).toBe(403);
    const ok = await api().get(`/api/integrations/sarufi/webhook?secret=${SECRET}`);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ ok: true });
  });

  test('POST rejects missing/wrong secret with 403 and logs REJECTED', async () => {
    expect((await post({ chat_id: 'c1', phone_number: PHONE, message: 'hi' }, { secret: null })).status).toBe(403);
    expect((await post({ chat_id: 'c1', phone_number: PHONE, message: 'hi' }, { secret: 'nope' })).status).toBe(403);
    const rejected = await events(prisma, 'INTEGRATION').count({ where: { provider: 'SARUFI', kind: 'WHATSAPP_INBOUND', status: 'REJECTED' } });
    expect(rejected).toBeGreaterThanOrEqual(2);
  });

  test('POST rejects a payload missing phone or message with 400', async () => {
    expect((await post({ chat_id: 'c1', message: 'hi' })).status).toBe(400);
    expect((await post({ chat_id: 'c1', phone_number: PHONE })).status).toBe(400);
  });

  test('greeting from a registered farmer → welcome + menu', async () => {
    const res = await post({ chat_id: 'chat-1', phone_number: PHONE, message: 'mambo' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/^Karibu MwaniMlinzi kwenye WhatsApp!/);
    expect(res.body.message).toMatch(/1\. Hali ya shamba/);
    expect(res.body.message).toMatch(/HATARI/);
    // The reply is exposed both ways for SDK compatibility.
    expect(res.body.actions?.[0]?.send_message).toBe(res.body.message);
    const logged = await events(prisma, 'INTEGRATION').findFirst({ where: { provider: 'SARUFI', kind: 'WHATSAPP_INBOUND', status: 'OK' }, orderBy: { createdAt: 'desc' } });
    expect(logged.reference).toBe('chat-1');
    expect(logged.phoneNumber).not.toContain('000001'); // masked
  });

  test('numeric menu shortcut "3" tells the farmer how to send a REPORT command', async () => {
    const res = await post({ chat_id: 'chat-2', phone_number: PHONE, message: '3' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/RIPOTI/);
  });

  test('HATARI keyword returns the current risk (reuses the SMS command handler)', async () => {
    // Other suites deliberately flag stored assessments. Establish a fresh valid assessment here.
    const farm = await prisma.farm.findFirst({ where: { farmCode: 'FARM001' } });
    await RiskService.runForFarm(farm.id, { refreshEnvironment: false, sendSms: false });
    const res = await post({ chat_id: 'chat-3', phone_number: PHONE, message: 'HATARI' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/FARM00\d: Hatari (ndogo|ya kati|kubwa|kubwa sana) ya /);
  });

  test('unregistered number is told to register first, no reply is fabricated for it', async () => {
    const res = await post({ chat_id: 'chat-4', phone_number: '+255699000999', message: 'hi' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/^Namba hii haijasajiliwa MwaniMlinzi\./);
  });

  test('accepts alternative payload shapes (user_id / text / from) without breaking', async () => {
    const res = await post({ user_id: 'legacy-1', from: PHONE, text: 'MSAADA' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/MwaniMlinzi:/);
  });
});
