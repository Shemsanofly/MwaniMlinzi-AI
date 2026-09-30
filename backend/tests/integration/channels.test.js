import { jest } from '@jest/globals';
import { api, auth, login, farmByCode } from '../helpers.js';
import { env } from '../../src/config/env.js';
import prisma from '../../src/config/prisma.js';
import { SMSService, setSMSClient, getSMSClient } from '../../src/services/smsService.js';
import { flushBackground } from '../../src/utils/background.js';
import { FakeSMSClient } from '../fakes/smsClient.js';
import { setOutlookProvider, getOutlookProvider, SeaOutlookService } from '../../src/services/seaOutlookService.js';
import { localDate } from '../../src/ai/seaOutlook.js';

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
const unknownPhone = () => `+255699${String(seq++).padStart(6, '0')}`;
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

async function onboardUssdFarmer(phoneNumber = unknownPhone(), inputs = ['1', '1', 'Asha USSD', '1', '1', '120']) {
  const sessionId = newSession();
  const replies = [(await ussd(sessionId, '', { phoneNumber })).text];
  for (let i = 1; i <= inputs.length; i++) replies.push((await ussd(sessionId, inputs.slice(0, i).join('*'), { phoneNumber })).text);
  return { sessionId, phoneNumber, replies, last: replies.at(-1) };
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

  test('allows the sandbox USSD alias without a secret when explicitly enabled', async () => {
    const previous = env.africastalking.allowUnsignedSandboxUssd;
    env.africastalking.allowUnsignedSandboxUssd = true;
    try {
      const res = await api()
        .post('/api/ussd/MwaniMlinzi')
        .type('form')
        .send({ sessionId: newSession(), phoneNumber: '+255699999999', serviceCode: SERVICE_CODE, networkCode: '63902', text: '' });
      expect(res.status).toBe(200);
      expect(res.text).toBe('CON MWANIMLINZI\n1. Kiswahili\n2. English');
    } finally {
      env.africastalking.allowUnsignedSandboxUssd = previous;
    }
  });

  test('unknown phone numbers can self-register as farmers and reach the normal USSD menu', async () => {
    const { sessionId, phoneNumber, replies, last } = await onboardUssdFarmer();
    expect(replies[0]).toBe('CON MWANIMLINZI\n1. Kiswahili\n2. English');
    expect(replies[1]).toBe('CON Taarifa za shamba lako zitatumika kukupa ushauri na kuboresha huduma.\n1. Nakubali\n2. Sikubali');
    expect(replies[2]).toBe('CON Ingiza jina lako kamili:');
    expect(replies[3]).toMatch(/^CON Chagua eneo/);
    expect(replies[4]).toMatch(/^CON Chagua aina ya mwani/);
    expect(replies[5]).toMatch(/^CON Weka idadi ya mistari/);
    expect(last).toMatch(/^CON Umesajiliwa MwaniMlinzi\.\nMWANIMLINZI\n1\. Hali ya shamba/);

    const user = await prisma.user.findUnique({
      where: { phone: phoneNumber },
      include: { roles: { include: { role: true } }, farmer: { include: { farms: { include: { plantingCycles: true, location: true, species: true } } } } },
    });
    expect(user).toBeTruthy();
    expect(user.roles.map((r) => r.role.name)).toContain('FARMER');
    expect(user.farmer.farms).toHaveLength(1);
    expect(user.farmer.farms[0]).toMatchObject({ lineCount: 120, farmingMethod: 'OFF_BOTTOM', exposure: 'MODERATE', anchoringMethod: 'WOODEN_STAKES' });
    expect(user.farmer.farms[0].species.code).toBe('KAPPA');
    expect(user.farmer.farms[0].location.locationName).toBe('Paje');
    expect(user.farmer.farms[0].plantingCycles).toHaveLength(1);
    expect(await prisma.ussdSession.findUnique({ where: { sessionId } })).toMatchObject({ userId: user.id, status: 'ACTIVE', currentMenu: 'MAIN' });
  });

  test('declining consent ends the session and stores no account', async () => {
    const { phoneNumber, last } = await onboardUssdFarmer(unknownPhone(), ['1', '2']);
    expect(last).toBe('END Hujasajiliwa. Hakuna taarifa zilizohifadhiwa.');
    expect(await prisma.user.findUnique({ where: { phone: phoneNumber } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { phone: (await onboardUssdFarmer(unknownPhone(), ['1', '1', 'Zuhura Consent', '1', '1', '10'])).phoneNumber } })).toMatchObject({ consentGiven: true });
  });

  test('a typed "other" location gets no borrowed coordinates; an admin can set the map point later', async () => {
    const { phoneNumber, last } = await onboardUssdFarmer(unknownPhone(), ['2', '1', 'Mwanahawa Other', '4', 'Michamvi', '1', '80']);
    expect(last).toMatch(/^CON /);
    const user = await prisma.user.findUnique({ where: { phone: phoneNumber }, include: { farmer: { include: { farms: { include: { location: true } } } } } });
    const farm = user.farmer.farms[0];
    expect(user.farmer.village).toBe('Michamvi');
    expect(farm.location).toBeNull();
    expect(farm.notes).toMatch(/no map point yet/);

    const admin = await login('admin');
    const res = await api().patch(`/api/farms/${farm.id}`).set(auth(admin)).send({ latitude: -6.16, longitude: 39.5, locationName: 'Michamvi', district: 'Kusini', region: 'Unguja South' });
    expect(res.status).toBe(200);
    expect(res.body.data.farm.location).toMatchObject({ latitude: -6.16, longitude: 39.5, locationName: 'Michamvi' });
  });

  test('a USSD-registered farmer can report symptoms without a web account', async () => {
    const { phoneNumber } = await onboardUssdFarmer(unknownPhone(), ['2', '1', 'Fatuma Featurephone', '2', '2', '0']);
    const user = await prisma.user.findUnique({ where: { phone: phoneNumber }, include: { farmer: { include: { farms: true } } } });
    const sessionId = newSession();
    expect((await ussd(sessionId, '', { phoneNumber })).text).toMatch(/^CON MWANIMLINZI/);
    expect((await ussd(sessionId, '3', { phoneNumber })).text).toBe('CON What did you see?\n1. Whitening\n2. Breakage\n3. Slow growth\n4. Other');
    expect((await ussd(sessionId, '3*1', { phoneNumber })).text).toMatch(/^END Thank you\. Your report has been saved\./);
    expect(await prisma.farmObservation.findFirst({
      where: { farmId: user.farmer.farms[0].id, reporterId: user.id, channel: 'USSD', whitening: true },
    })).toBeTruthy();
  });

  test('a database failure ends the session with a simple message (no technical details)', async () => {
    const spy = jest.spyOn(prisma.user, 'findFirst').mockRejectedValueOnce(new Error('connection refused at 10.0.0.1:5432'));
    try {
      const r = await ussd(newSession(), '');
      expect(r.status).toBe(200);
      expect(r.text).toBe('END Samahani, kuna tatizo. Tafadhali jaribu tena.');
      expect(await prisma.integrationEvent.findFirst({ where: { kind: 'USSD', status: 'ERROR' }, orderBy: { createdAt: 'desc' } })).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });

  test('main menu (deck slide 8) in the farmer’s language → farm status → risk summary', async () => {
    const { replies, sessionId } = await walk(['1', '1', '1']);
    expect(replies[0]).toBe('CON MWANIMLINZI\n1. Hali ya shamba\n2. Tahadhari\n3. Ripoti tatizo\n4. Rekodi mavuno\n5. Msaada');
    expect(replies[1]).toBe('CON Hali ya shamba\n1. Hatari na hatua\n2. Maji kupwa na kukausha');
    expect(replies[2]).toMatch(/^CON Chagua shamba\n1\. FARM001/);
    expect(replies[3]).toMatch(/^END FARM001\nHatari: (NDOGO|YA KATI|KUBWA|KUBWA SANA) \(/);
    expect(replies[3]).toMatch(/Hatua: /);
    expect(replies[3]).not.toMatch(/probability|%|risk/i);
    expect(replies[3].length).toBeLessThanOrEqual(186);
    const s = await prisma.ussdSession.findUnique({ where: { sessionId } });
    expect(s).toMatchObject({ phoneNumber: PHONE, serviceCode: SERVICE_CODE, networkCode: '63902', status: 'ENDED', language: 'sw', requestCount: 4 });
    expect(s.userId).toBeTruthy();
  });

  test('a retried request returns the same reply without repeating side effects', async () => {
    const sessionId = newSession();
    await ussd(sessionId, '');
    await ussd(sessionId, '3');
    await ussd(sessionId, '3*2');
    const before = await prisma.farmObservation.count({ where: { channel: 'USSD' } });
    const first = await ussd(sessionId, '3*2*3');
    const again = await ussd(sessionId, '3*2*3');
    await flushBackground();
    expect(again.text).toBe(first.text);
    expect(await prisma.farmObservation.count({ where: { channel: 'USSD' } })).toBe(before + 1);
    expect(await prisma.integrationEvent.count({ where: { kind: 'USSD', reference: sessionId, status: 'DUPLICATE' } })).toBe(1);
  });

  test('3 → report a problem (whitening): stored, risk re-run, SMS confirmation', async () => {
    const before = await prisma.farmObservation.count({ where: { channel: 'USSD' } });
    const sentBefore = fake.to(PHONE).length;
    const { replies, last } = await walk(['3', '2', '1']); // FARM002 (FARM001's seeded state is used by the flow test)
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

  test('4 → record harvest with validation and confirmation (source USSD)', async () => {
    const before = await prisma.harvestRecord.count({ where: { channel: 'USSD' } });
    const { replies } = await walk(['4', '2', 'abc', '0', '120', '1']);
    expect(replies[2]).toMatch(/^CON Ingiza kiasi cha mavuno kwa kilo/);
    expect(replies[3]).toMatch(/Kiasi si sahihi/);
    expect(replies[4]).toMatch(/^CON MWANIMLINZI/); // '0' goes back to the main menu
    expect(await prisma.harvestRecord.count({ where: { channel: 'USSD' } })).toBe(before);

    const ok = await walk(['4', '2', '120', '1']);
    expect(ok.replies[3]).toMatch(/Thibitisha mavuno ya kg 120 kwa FARM002\?/);
    expect(ok.last).toBe('END Asante. Mavuno ya kg 120 yamerekodiwa kwa FARM002.');
    const h = await prisma.harvestRecord.findFirst({ where: { channel: 'USSD' }, orderBy: { createdAt: 'desc' } });
    expect(h).toMatchObject({ actualQuantity: 120, unit: 'KG_DRY' });
    expect(await prisma.harvestRecord.count({ where: { channel: 'USSD' } })).toBe(before + 1);

    const cancelled = await walk(['4', '2', '50', '2']);
    expect(cancelled.last).toBe('END Mavuno hayajarekodiwa.');
    expect(await prisma.harvestRecord.count({ where: { channel: 'USSD' } })).toBe(before + 1);
  });

  test('5 → help → approved advice; about the service', async () => {
    expect((await walk(['5']))).toMatchObject({ last: 'CON Msaada\n1. Ushauri\n2. Lugha\n3. Kuhusu huduma' });
    expect((await walk(['5', '3'])).last).toMatch(/^END MwaniMlinzi /);
    expect((await walk(['5', '1', '1'])).last).toMatch(/^END FARM001\n?(:| )?.*(Hatua: |Data haitoshi|Endelea)/s);
  });

  test('5 → 2 → language change is saved to the user and used immediately', async () => {
    const { last } = await walk(['5', '2', '2']);
    expect(last).toMatch(/^CON Language changed to English\.\nMWANIMLINZI\n1\. Farm status/);
    expect((await prisma.user.findUnique({ where: { phone: PHONE } })).preferredLanguage).toBe('en');
    const next = await walk(['1', '1', '1']);
    expect(next.replies[0]).toBe('CON MWANIMLINZI\n1. Farm status\n2. Alerts\n3. Report a problem\n4. Record harvest\n5. Help');
    expect(next.last).toMatch(/^END FARM001\nRisk: (LOW|MEDIUM|HIGH|CRITICAL) \(/);
    expect(next.last).toMatch(/Action: /);
    await walk(['5', '2', '1']);
    expect((await prisma.user.findUnique({ where: { phone: PHONE } })).preferredLanguage).toBe('sw');
  });

  test('2 → alerts: the newest unresolved real alerts for the caller\'s farms', async () => {
    const { last } = await walk(['2']);
    expect(last).toMatch(/^END Tahadhari\n/);
    expect(last).toMatch(/FARM00[12]/);
    expect(last).not.toMatch(/MAJARIBIO|SIMULATION/);
    expect(last.length).toBeLessThanOrEqual(186);
  });

  test('1 → 2 → today\'s low tide work window and drying verdict from the stored forecast', async () => {
    const original = getOutlookProvider();
    const [y, m, d] = localDate().split('-').map(Number);
    const times = Array.from({ length: 72 }, (_, i) => `${new Date(Date.UTC(y, m - 1, d + Math.floor(i / 24))).toISOString().slice(0, 10)}T${String(i % 24).padStart(2, '0')}:00`);
    setOutlookProvider({
      fetch: async () => ({
        tide: { times, levels: times.map((t) => Math.round(1.5 * Math.cos((2 * Math.PI * (Number(t.slice(11, 13)) - 5)) / 12) * 100) / 100) },
        rain: { times, probability: times.map(() => 10), mm: times.map(() => 0) },
        providers: { tide: 'open-meteo-marine', rain: 'open-meteo' }, errors: {},
      }),
    });
    try {
      const farm002 = await prisma.farm.findUnique({ where: { farmCode: 'FARM002' } });
      await prisma.seaOutlook.deleteMany({ where: { farmId: farm002.id } });
      // The 06:00 run stores the forecast; USSD reads it.
      await SeaOutlookService.refreshForFarm(await prisma.farm.findUnique({ where: { id: farm002.id }, include: { location: true } }));
      const { last } = await walk(['1', '2', '2']);
      expect(last).toMatch(/^END FARM002\nMaji kupwa: (leo|kesho) 11:00 \(muda wa kazi \d\d:00-\d\d:00\)/);
      expect(last).toMatch(/Kukausha leo: NZURI/);
      expect(last.length).toBeLessThanOrEqual(186);

      // USSD answers from the stored morning forecast only — it never waits on a live fetch (deck slide 7).
      let calls = 0;
      setOutlookProvider({ fetch: async () => { calls += 1; return { tide: null, rain: null, providers: {}, errors: { tide: 'down', rain: 'down' } }; } });
      const farm001 = await prisma.farm.findUnique({ where: { farmCode: 'FARM001' } });
      await prisma.seaOutlook.deleteMany({ where: { farmId: farm001.id } });
      expect((await walk(['1', '2', '1'])).last).toBe('END FARM001: Hakuna utabiri wa bahari kwa shamba hili bado.');
      expect(calls).toBe(0);
    } finally {
      setOutlookProvider(original);
    }
  });

  test('invalid choices re-prompt; stale sessions expire', async () => {
    expect((await walk(['9'])).last).toMatch(/^CON Chaguo si sahihi\./);
    const sessionId = newSession();
    await ussd(sessionId, '');
    // updated_at is a timestamp without time zone holding UTC (Prisma's convention), so compute it in UTC
    // rather than with now(), which follows the server's TimeZone setting (e.g. Africa/Nairobi).
    await prisma.$executeRaw`UPDATE ussd_sessions SET updated_at = (now() AT TIME ZONE 'UTC') - interval '10 minutes' WHERE session_id = ${sessionId}`;
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
    // Another farmer cannot open this farmer's photo.
    const other = await api().post('/api/auth/register').send({ phone: '0659000077', password: 'Passw0rd!x', fullName: 'Other Farmer', consent: true });
    expect((await api().get(`/api/uploads/${ok.body.data.file.id}`).set(auth(other.body.data.token))).status).toBe(403);
  });
});
