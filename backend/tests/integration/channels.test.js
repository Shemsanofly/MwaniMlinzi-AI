import { api, auth, login, farmByCode } from '../helpers.js';
import prisma from '../../src/config/prisma.js';
import { SMSService, setSMSClient, getSMSClient } from '../../src/services/smsService.js';
import { flushBackground } from '../../src/utils/background.js';
import { FakeSMSClient } from '../fakes/smsClient.js';

afterAll(() => prisma.$disconnect());
const PHONE = '+255777000001';

const SECRET = 'test-callback-secret';
const SERVICE_CODE = '*384*1234#';
const fake = new FakeSMSClient();
let originalClient;
beforeAll(() => { originalClient = getSMSClient(); setSMSClient(fake); });
afterAll(() => setSMSClient(originalClient));

let seq = 0;
const newSession = () => `ATUid_test_${Date.now()}_${seq++}`;
const ussd = (sessionId, text, { phoneNumber = PHONE, secret = SECRET, serviceCode = SERVICE_CODE } = {}) => api()
  .post(`/api/integrations/africastalking/ussd${secret ? `?secret=${secret}` : ''}`)
  .type('form')
  .send({ sessionId, phoneNumber, serviceCode, networkCode: '63902', text });
/** Walk a whole session: each step sends the cumulative '*'-joined path like Africa's Talking does. */
async function walk(inputs, opts) {
  const sessionId = newSession();
  const replies = [(await ussd(sessionId, '', opts)).text];
  for (let i = 1; i <= inputs.length; i++) replies.push((await ussd(sessionId, inputs.slice(0, i).join('*'), opts)).text);
  return { sessionId, replies, last: replies.at(-1) };
}

describe("Africa's Talking USSD callback", () => {
  test('rejects missing/wrong secrets, bad payloads and other service codes', async () => {
    expect((await ussd(newSession(), '', { secret: null })).status).toBe(403);
    const wrong = await ussd(newSession(), '', { secret: 'nope' });
    expect(wrong.status).toBe(403);
    expect(wrong.text).toMatch(/^END/);
    expect((await api().post(`/api/integrations/africastalking/ussd?secret=${SECRET}`).type('form').send({ text: '' })).status).toBe(400);
    expect((await ussd(newSession(), '', { serviceCode: '*999#' })).text).toBe('END Unknown service.');
    expect(await prisma.integrationEvent.count({ where: { kind: 'USSD', status: 'REJECTED' } })).toBeGreaterThanOrEqual(4);
  });

  test('unknown phone numbers are asked to register', async () => {
    const r = await ussd(newSession(), '', { phoneNumber: '+255699999999' });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/plain/);
    expect(r.text).toBe('END Simu hii haijasajiliwa MwaniMlinzi. Tafadhali jisajili kwanza.');
  });

  test('main menu in the farmer’s language, farm selection, risk summary', async () => {
    const { replies, sessionId } = await walk(['1', '1']);
    expect(replies[0]).toMatch(/^CON MwaniMlinzi\n1\. Hatari ya Shamba\n2\. Ripoti Dalili\n3\. Mavuno\n4\. Ushauri\n5\. Lugha/);
    expect(replies[1]).toMatch(/^CON Chagua shamba:\n1\. FARM001/);
    expect(replies[2]).toMatch(/^END FARM001: Hatari (ndogo|ya kati|kubwa|kubwa sana) \(/);
    expect(replies[2]).toMatch(/Hatua: /);
    expect(replies[2]).not.toMatch(/probability|%|risk/i);
    expect(replies[2].length).toBeLessThanOrEqual(186);
    const s = await prisma.ussdSession.findUnique({ where: { sessionId } });
    expect(s).toMatchObject({ phoneNumber: PHONE, serviceCode: SERVICE_CODE, networkCode: '63902', status: 'ENDED', language: 'sw', requestCount: 3 });
    expect(s.userId).toBeTruthy();
  });

  test('a retried request returns the same reply without repeating side effects', async () => {
    const sessionId = newSession();
    await ussd(sessionId, '');
    await ussd(sessionId, '2');
    await ussd(sessionId, '2*2');
    const before = await prisma.farmObservation.count({ where: { channel: 'USSD' } });
    const first = await ussd(sessionId, '2*2*3');
    const again = await ussd(sessionId, '2*2*3');
    await flushBackground();
    expect(again.text).toBe(first.text);
    expect(await prisma.farmObservation.count({ where: { channel: 'USSD' } })).toBe(before + 1);
    expect(await prisma.integrationEvent.count({ where: { kind: 'USSD', reference: sessionId, status: 'DUPLICATE' } })).toBe(1);
  });

  test('2 → report whitening: stored, risk re-run, SMS confirmation', async () => {
    const before = await prisma.farmObservation.count({ where: { channel: 'USSD' } });
    const sentBefore = fake.to(PHONE).length;
    const { replies, last } = await walk(['2', '2', '1']); // FARM002 (FARM001's seeded state is used by the flow test)
    expect(replies[2]).toMatch(/Umeona nini\?\n1\. Mwani kuwa mweupe\n2\. Kukatika\n3\. Ukuaji hafifu\n4\. Nyingine/);
    expect(last).toMatch(/^END Asante\. Ripoti yako imehifadhiwa\./);
    await flushBackground();
    const obs = await prisma.farmObservation.findFirst({ where: { channel: 'USSD' }, orderBy: { createdAt: 'desc' } });
    expect(await prisma.farmObservation.count({ where: { channel: 'USSD' } })).toBe(before + 1);
    expect(obs).toMatchObject({ whitening: true, diseaseSymptoms: true });
    const pred = await prisma.riskPrediction.findFirst({ where: { farmId: obs.farmId, riskType: 'HEAT_ICE_ICE' }, orderBy: { createdAt: 'desc' } });
    expect(pred.trigger).toBe('OBSERVATION');
    const sms = fake.to(PHONE).slice(sentBefore);
    expect(sms.some((m) => /^MWANIMLINZI: Ripoti ya FARM002 imepokelewa\. Hatari/.test(m.message))).toBe(true);
    const log = await prisma.notificationLog.findFirst({ where: { messageType: 'OBSERVATION_CONFIRMATION' }, orderBy: { createdAt: 'desc' } });
    expect(log).toMatchObject({ status: 'QUEUED', language: 'sw', recipient: PHONE });
  });

  test('3 → record harvest with validation and confirmation (source USSD)', async () => {
    const before = await prisma.harvestRecord.count({ where: { channel: 'USSD' } });
    const { replies } = await walk(['3', '2', '1', 'abc', '0', '120', '1']);
    expect(replies[2]).toMatch(/^CON Mavuno\n1\. Rekodi mavuno\n2\. Makadirio ya mavuno/);
    expect(replies[3]).toMatch(/Weka kilo/);
    expect(replies[4]).toMatch(/Kiasi si sahihi/);
    expect(replies[5]).toMatch(/^CON MwaniMlinzi/); // '0' goes back to the main menu
    expect(await prisma.harvestRecord.count({ where: { channel: 'USSD' } })).toBe(before);

    const ok = await walk(['3', '2', '1', '120', '1']);
    expect(ok.replies[4]).toMatch(/Thibitisha mavuno ya kg 120 kwa FARM002\?/);
    expect(ok.last).toBe('END Asante. Mavuno ya kg 120 yamerekodiwa kwa FARM002.');
    const h = await prisma.harvestRecord.findFirst({ where: { channel: 'USSD' }, orderBy: { createdAt: 'desc' } });
    expect(h).toMatchObject({ actualQuantity: 120, unit: 'KG_DRY' });
    expect(await prisma.harvestRecord.count({ where: { channel: 'USSD' } })).toBe(before + 1);

    const cancelled = await walk(['3', '2', '1', '50', '2']);
    expect(cancelled.last).toBe('END Mavuno hayajarekodiwa.');
    expect(await prisma.harvestRecord.count({ where: { channel: 'USSD' } })).toBe(before + 1);
  });

  test('3 → expected harvest and 4 → approved advice', async () => {
    expect((await walk(['3', '1', '2'])).last).toMatch(/^END (FARM001: Mavuno yanayotarajiwa ni takriban kg \d+|Hakuna makadirio)/);
    expect((await walk(['4', '1'])).last).toMatch(/^END FARM001\n?(:| )?.*(Hatua: |Data haitoshi|Endelea)/s);
  });

  test('5 → language change is saved to the user and used immediately', async () => {
    const { last } = await walk(['5', '2']);
    expect(last).toMatch(/^CON Language changed to English\.\nMwaniMlinzi\n1\. Farm risk/);
    expect((await prisma.user.findUnique({ where: { phone: PHONE } })).preferredLanguage).toBe('en');
    const next = await walk(['1', '1']);
    expect(next.replies[0]).toMatch(/1\. Farm risk/);
    expect(next.last).toMatch(/^END FARM001: (Low|Medium|High|Very high) risk/);
    await walk(['5', '1']);
    expect((await prisma.user.findUnique({ where: { phone: PHONE } })).preferredLanguage).toBe('sw');
  });

  test('invalid choices re-prompt; stale sessions expire', async () => {
    expect((await walk(['9'])).last).toMatch(/^CON Chaguo si sahihi\./);
    const sessionId = newSession();
    await ussd(sessionId, '');
    await prisma.$executeRaw`UPDATE ussd_sessions SET updated_at = now() - interval '10 minutes' WHERE session_id = ${sessionId}`;
    expect((await ussd(sessionId, '1')).text).toBe('END Muda wa kipindi umekwisha. Tafadhali piga tena.');
  });
});

describe("Africa's Talking inbound SMS + delivery reports", () => {
  const inbound = (body, secret = SECRET) => api().post(`/api/integrations/africastalking/sms?secret=${secret}`).type('form').send(body);
  const delivery = (body) => api().post(`/api/integrations/africastalking/sms/delivery?secret=${SECRET}`).type('form').send(body);

  test('HATARI command is answered by a real outbound SMS in Kiswahili', async () => {
    const before = fake.to(PHONE).length;
    const res = await inbound({ from: PHONE, to: '15000', text: 'HATARI FARM001', id: `in-${Date.now()}`, date: new Date().toISOString() });
    expect(res.status).toBe(200);
    await flushBackground();
    const reply = fake.to(PHONE).slice(before).at(-1);
    expect(reply.message).toMatch(/^FARM001: Hatari (ndogo|ya kati|kubwa|kubwa sana) ya /);
    const log = await prisma.notificationLog.findFirst({ where: { messageType: 'SMS_REPLY' }, orderBy: { createdAt: 'desc' } });
    expect(log).toMatchObject({ recipient: PHONE, status: 'QUEUED' });
  });

  test('duplicate inbound messages are processed once; secret required', async () => {
    const id = `dup-${Date.now()}`;
    const before = fake.sent.length;
    expect((await inbound({ from: PHONE, text: 'MSAADA', id })).text).toBe('OK');
    expect((await inbound({ from: PHONE, text: 'MSAADA', id })).text).toBe('DUPLICATE');
    await flushBackground();
    expect(fake.sent.length).toBe(before + 1);
    expect((await inbound({ from: PHONE, text: 'MSAADA' }, 'wrong')).status).toBe(403);
  });

  test('REPORT via SMS stores an SMS observation; unknown numbers get the registration message', async () => {
    const count = await prisma.farmObservation.count({ where: { channel: 'SMS' } });
    await inbound({ from: '0777000001', text: 'RIPOTI FARM002 NZURI', id: `r-${Date.now()}` });
    await inbound({ from: '+255699999998', text: 'HATARI', id: `u-${Date.now()}` });
    await flushBackground();
    expect(await prisma.farmObservation.count({ where: { channel: 'SMS' } })).toBe(count + 1);
    expect(fake.to('+255699999998').at(-1).message).toBe('Simu hii haijasajiliwa MwaniMlinzi. Tafadhali jisajili kwanza.');
  });

  test('delivery reports update the log once and never downgrade a final status', async () => {
    const sent = await SMSService.sendRaw(PHONE, 'test', { type: 'ADMIN_TEST' });
    expect((await delivery({ id: sent.providerRef, status: 'Success', phoneNumber: PHONE, networkCode: '63902' })).text).toBe('OK');
    let log = await prisma.notificationLog.findUnique({ where: { id: sent.logId } });
    expect(log.status).toBe('DELIVERED');
    expect(log.deliveredAt).toBeTruthy();
    expect((await delivery({ id: sent.providerRef, status: 'Success' })).text).toBe('DUPLICATE');
    expect((await delivery({ id: sent.providerRef, status: 'Buffered' })).text).toBe('ALREADY_FINAL');
    log = await prisma.notificationLog.findUnique({ where: { id: sent.logId } });
    expect(log.status).toBe('DELIVERED');
    expect((await delivery({ id: 'unknown-id', status: 'Failed' })).text).toBe('UNKNOWN_MESSAGE');
    const failed = await SMSService.sendRaw(PHONE, 'test 2', { type: 'ADMIN_TEST' });
    await delivery({ id: failed.providerRef, status: 'Failed', failureReason: 'UserInBlacklist' });
    expect(await prisma.notificationLog.findUnique({ where: { id: failed.logId } })).toMatchObject({ status: 'FAILED', error: 'UserInBlacklist' });
  });
});

describe("admin Africa's Talking panel", () => {
  test('shows honest status without secrets; Test SMS reports NOT_CONFIGURED without credentials', async () => {
    const admin = await login('admin');
    const res = await api().get('/api/admin/integrations/africastalking').set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ environment: 'SANDBOX', sms: 'NOT_CONFIGURED', ussd: 'CONFIGURED', connection: 'NOT_CONFIGURED', apiKeySet: false });
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
    setSMSClient(originalClient);
    try {
      const t = await api().post('/api/admin/integrations/africastalking/test-sms').set(auth(admin)).send({ phone: '0777000001' });
      expect(t.status).toBe(200);
      expect(t.body.data.status).toBe('NOT_CONFIGURED');
      expect(t.body.message).toBe('SMS not sent');
    } finally {
      setSMSClient(fake);
    }
    expect((await api().get('/api/admin/integrations/africastalking').set(auth(await login('farmer')))).status).toBe(403);
  });

  test('the web simulators are gone', async () => {
    const t = await login('farmer');
    expect((await api().post('/api/sms/simulate').set(auth(t)).send({ from: PHONE, message: 'RISK' })).status).toBe(404);
    expect((await api().post('/api/ussd/simulate').set(auth(t)).send({ sessionId: 'x', phoneNumber: PHONE, text: '' })).status).toBe(404);
  });
});

describe('AI assistant', () => {
  test('answers from real risk factors and approved actions', async () => {
    const t = await login('farmer');
    const farm = await farmByCode(t, 'FARM001');
    const why = await api().post('/api/ai/chat').set(auth(t)).send({ message: 'Kwa nini hatari yangu iko juu?', farmId: farm.id });
    expect(why.status).toBe(200);
    expect(why.body.data.intent).toBe('WHY_RISK');
    expect(why.body.data.language).toBe('sw');
    expect(why.body.data.reply).toMatch(/Joto la uso wa bahari/);
    expect(why.body.data.generatedBy).toBe('TEMPLATE');
    const todo = await api().post('/api/ai/chat').set(auth(t)).send({ message: 'Nifanye nini?', farmId: farm.id });
    expect(todo.body.data.approvedAction.text).toBeTruthy();
    expect(todo.body.data.reply).toContain(todo.body.data.approvedAction.text);
  });
  test('refuses to invent treatments', async () => {
    const t = await login('farmer');
    const res = await api().post('/api/ai/chat').set(auth(t)).send({ message: 'What medicine should I use?' });
    expect(res.body.data.intent).toBe('TREATMENT');
    expect(res.body.data.reply).toMatch(/contact an extension officer/);
  });
  test('cannot ask about a farm you do not own', async () => {
    const admin = await login('admin');
    const other = await farmByCode(admin, 'FARM003');
    const res = await api().post('/api/ai/chat').set(auth(await login('farmer'))).send({ message: 'Why?', farmId: other.id });
    expect(res.status).toBe(403);
  });
});

describe('uploads', () => {
  test('rejects non-images and accepts a real PNG', async () => {
    const t = await login('farmer');
    const bad = await api().post('/api/uploads').set(auth(t)).attach('image', Buffer.from('not an image'), { filename: 'x.png', contentType: 'image/png' });
    expect(bad.status).toBe(400);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    const ok = await api().post('/api/uploads').set(auth(t)).attach('image', png, { filename: 'leaf.png', contentType: 'image/png' });
    expect(ok.status).toBe(201);
    const get = await api().get(`/api/uploads/${ok.body.data.file.id}`).set(auth(t));
    expect(get.status).toBe(200);
    expect(get.headers['content-type']).toBe('image/png');
    expect((await api().get(`/api/uploads/${ok.body.data.file.id}`).set(auth(await login('buyer')))).status).toBe(403);
  });
});
