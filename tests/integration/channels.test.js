import { farmRecords, events } from '../../src/server/db/records.js';
import { jest } from '@jest/globals';
import { api, auth, login, farmByCode } from '../helpers.js';
import { env } from '../../src/server/config/env.js';
import prisma from '../../src/server/config/prisma.js';
import { SMSService, setSMSClient, getSMSClient } from '../../src/server/services/smsService.js';
import { flushBackground } from '../../src/server/utils/background.js';
import { FakeSMSClient } from '../fakes/smsClient.js';
import { setOutlookProvider, getOutlookProvider, SeaOutlookService } from '../../src/server/services/seaOutlookService.js';
import { localDate } from '../../src/server/ai/seaOutlook.js';
import { RiskService } from '../../src/server/services/riskService.js';

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

// Default inputs cover: language → consent → (skip co-op code with empty) → name → location → species → lines.
async function onboardUssdFarmer(phoneNumber = unknownPhone(), inputs = ['1', '1', '', 'Asha USSD', '1', '1', '120']) {
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
    expect(await events(prisma, 'INTEGRATION').count({ where: { kind: 'USSD', status: 'REJECTED' } })).toBeGreaterThanOrEqual(4);
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
    // Deck slide 10 "cooperative-assisted onboarding": optional co-op code step before name.
    expect(replies[2]).toBe('CON Ingiza msimbo wa ushirika (acha wazi kama hupo kwenye ushirika):');
    expect(replies[3]).toBe('CON Ingiza jina lako kamili:');
    expect(replies[4]).toMatch(/^CON Chagua eneo/);
    expect(replies[5]).toMatch(/^CON Chagua aina ya mwani/);
    expect(replies[6]).toMatch(/^CON Weka idadi ya mistari/);
    expect(last).toMatch(/^CON Umesajiliwa MwaniMlinzi\.\nMWANIMLINZI\n1\. Hali ya shamba/);

    const user = await prisma.user.findUnique({
      where: { phone: phoneNumber },
      include: { roles: { include: { role: true } }, farmer: { include: { farms: { include: { plantingCycles: true, species: true } } } } },
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
    expect(await prisma.user.findUnique({ where: { phone: (await onboardUssdFarmer(unknownPhone(), ['1', '1', '', 'Zuhura Consent', '1', '1', '10'])).phoneNumber } })).toMatchObject({ consentGiven: true });
  });

  test('a typed "other" location gets no borrowed coordinates; an admin can set the map point later', async () => {
    const { phoneNumber, last } = await onboardUssdFarmer(unknownPhone(), ['2', '1', '', 'Mwanahawa Other', '4', 'Michamvi', '1', '80']);
    expect(last).toMatch(/^CON /);
    const user = await prisma.user.findUnique({ where: { phone: phoneNumber }, include: { farmer: { include: { farms: { } } } } });
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
    const { phoneNumber } = await onboardUssdFarmer(unknownPhone(), ['2', '1', '', 'Fatuma Featurephone', '2', '2', '0']);
    const user = await prisma.user.findUnique({ where: { phone: phoneNumber }, include: { farmer: { include: { farms: true } } } });
    const sessionId = newSession();
    expect((await ussd(sessionId, '', { phoneNumber })).text).toMatch(/^CON MWANIMLINZI/);
    expect((await ussd(sessionId, '3', { phoneNumber })).text).toBe('CON What did you see?\n1. Whitening\n2. Breakage\n3. Slow growth\n4. Other');
    // Deck slide 8 "confirmed before saving": the symptom choice gets a Yes/No confirmation.
    expect((await ussd(sessionId, '3*1', { phoneNumber })).text).toMatch(/^CON Confirm report of "Whitening" for /);
    expect((await ussd(sessionId, '3*1*1', { phoneNumber })).text).toMatch(/^END Thank you\. Your report has been saved\./);
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
      expect(await events(prisma, 'INTEGRATION').findFirst({ where: { kind: 'USSD', status: 'ERROR' }, orderBy: { createdAt: 'desc' } })).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });

  test('main menu (deck slide 8) in the farmer’s language → farm status → risk summary', async () => {
    const { replies, sessionId } = await walk(['1', '1', '1']);
    expect(replies[0]).toBe('CON MWANIMLINZI\n1. Hali ya shamba\n2. Tahadhari\n3. Ripoti tatizo\n4. Rekodi mavuno\n5. Msaada');
    expect(replies[1]).toBe('CON Hali ya shamba\n1. Hatari na hatua\n2. Maji kupwa na kukausha\n3. Faida ya msimu');
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
    await ussd(sessionId, '3*2');       // pick farm
    await ussd(sessionId, '3*2*3');     // pick symptom (slow growth) → confirmation prompt
    const before = await prisma.farmObservation.count({ where: { channel: 'USSD' } });
    const first = await ussd(sessionId, '3*2*3*1');  // confirm → observation saved
    const again = await ussd(sessionId, '3*2*3*1');  // retry same path → cached reply, no second save
    await flushBackground();
    expect(again.text).toBe(first.text);
    expect(await prisma.farmObservation.count({ where: { channel: 'USSD' } })).toBe(before + 1);
    expect(await events(prisma, 'INTEGRATION').count({ where: { kind: 'USSD', reference: sessionId, status: 'DUPLICATE' } })).toBe(1);
  });

  test('3 → report a problem (whitening): stored, risk re-run, SMS confirmation', async () => {
    const before = await prisma.farmObservation.count({ where: { channel: 'USSD' } });
    const sentBefore = fake.to(PHONE).length;
    // Deck slide 8: confirm-before-save. '1' picks the symptom, '1' again confirms.
    const { replies, last } = await walk(['3', '2', '1', '1']); // FARM002
    expect(replies[2]).toMatch(/Umeona nini\?\n1\. Mwani kuwa mweupe\n2\. Kukatika\n3\. Ukuaji hafifu\n4\. Nyingine/);
    expect(replies[3]).toMatch(/^CON Thibitisha ripoti ya "Mwani kuwa mweupe"/);
    expect(last).toMatch(/^END Asante\. Ripoti yako imehifadhiwa\./);
    await flushBackground();
    const obs = await prisma.farmObservation.findFirst({ where: { channel: 'USSD' }, orderBy: { createdAt: 'desc' } });
    expect(await prisma.farmObservation.count({ where: { channel: 'USSD' } })).toBe(before + 1);
    expect(obs).toMatchObject({ whitening: true, diseaseSymptoms: true });
    const pred = await prisma.riskPrediction.findFirst({ where: { farmId: obs.farmId, riskType: 'HEAT_ICE_ICE' }, orderBy: { createdAt: 'desc' } });
    expect(pred.trigger).toBe('OBSERVATION');
    const sms = fake.to(PHONE).slice(sentBefore);
    expect(sms.some((m) => /^MWANIMLINZI: Ripoti ya FARM002 imepokelewa\. Hatari/.test(m.message))).toBe(true);
    const log = await events(prisma, 'DELIVERY').findFirst({ where: { messageType: 'OBSERVATION_CONFIRMATION' }, orderBy: { createdAt: 'desc' } });
    expect(log).toMatchObject({ status: 'QUEUED', language: 'sw', recipient: PHONE });
  });

  test('4 → 1 → record harvest with validation and confirmation (source USSD)', async () => {
    const before = await prisma.harvestRecord.count({ where: { channel: 'USSD' } });
    const { replies } = await walk(['4', '1', '2', 'abc', '0', '120', '1']);
    expect(replies[1]).toBe('CON Rekodi mavuno\n1. Mavuno\n2. Mauzo\n3. Gharama\n4. Kazi');
    expect(replies[3]).toMatch(/^CON Ingiza kiasi cha mavuno kwa kilo/);
    expect(replies[4]).toMatch(/Kiasi si sahihi/);
    expect(replies[5]).toMatch(/^CON MWANIMLINZI/); // '0' goes back to the main menu
    expect(await prisma.harvestRecord.count({ where: { channel: 'USSD' } })).toBe(before);

    // Deck slide 8: "harvest kg & quality". '1' confirms kg → quality menu; '1' again picks Grade A.
    const ok = await walk(['4', '1', '2', '120', '1', '1']);
    expect(ok.replies[4]).toMatch(/Thibitisha mavuno ya kg 120 kwa FARM002\?/);
    expect(ok.replies[5]).toMatch(/^CON Ubora wa mavuno/);
    expect(ok.last).toBe('END Asante. Mavuno ya kg 120 (Daraja A) yamerekodiwa kwa FARM002.');
    const h = await prisma.harvestRecord.findFirst({ where: { channel: 'USSD' }, orderBy: { createdAt: 'desc' } });
    expect(h).toMatchObject({ actualQuantity: 120, unit: 'KG_DRY', qualityGrade: 'A' });
    expect(await prisma.harvestRecord.count({ where: { channel: 'USSD' } })).toBe(before + 1);

    const cancelled = await walk(['4', '1', '2', '50', '2']);
    expect(cancelled.last).toBe('END Mavuno hayajarekodiwa.');
    expect(await prisma.harvestRecord.count({ where: { channel: 'USSD' } })).toBe(before + 1);
  });

  test('4 → 2 → a confirmed sale sends one SMS receipt, including when AT retries', async () => {
    const farm = await prisma.farm.findUnique({ where: { farmCode: 'FARM002' } });
    const before = await farmRecords(prisma, 'SALE').count({ where: { farmId: farm.id, channel: 'USSD' } });
    await flushBackground();
    const smsBefore = fake.to(PHONE).length;
    const { sessionId, replies, last } = await walk(['4', '2', '2', '120', '1,000', '00', '1000', '1']); // '0' alone always means 'back to the main menu'
    expect(replies[3]).toMatch(/^CON Ingiza kiasi ulichouza kwa kilo/);
    expect(replies[4]).toMatch(/^CON Ingiza bei kwa kilo \(TSh\)/);
    expect(replies[5]).toMatch(/Bei si sahihi/);
    expect(replies[6]).toMatch(/Bei si sahihi/);
    expect(replies[7]).toBe('CON Thibitisha mauzo ya kg 120 kwa TSh 1,000/kg = TSh 120,000 (FARM002)?\n1. Ndiyo\n2. Hapana');
    expect(last).toBe('END Asante. Mauzo ya TSh 120,000 yamerekodiwa kwa FARM002.');
    const sale = await farmRecords(prisma, 'SALE').findFirst({ where: { farmId: farm.id, channel: 'USSD' }, orderBy: { createdAt: 'desc' } });
    expect(sale).toMatchObject({ quantityKg: 120, pricePerKg: 1000, totalTzs: 120000, paymentStatus: 'PAID' });
    expect(await farmRecords(prisma, 'SALE').count({ where: { farmId: farm.id, channel: 'USSD' } })).toBe(before + 1);
    await flushBackground();
    expect(fake.to(PHONE).length).toBe(smsBefore + 1);
    expect(fake.to(PHONE).at(-1).message).toBe(`MWANIMLINZI: ${last.slice(4)}`);
    expect((await ussd(sessionId, '4*2*2*120*1,000*00*1000*1')).text).toBe(last);
    await flushBackground();
    expect(fake.to(PHONE).length).toBe(smsBefore + 1);
    expect(await farmRecords(prisma, 'SALE').count({ where: { farmId: farm.id, channel: 'USSD' } })).toBe(before + 1);
  });

  test('4 → 3 → record a cost (category → amount → confirm); 4 → 4 → work done today', async () => {
    const farm = await prisma.farm.findUnique({ where: { farmCode: 'FARM002' } });
    await flushBackground();
    const smsBefore = fake.to(PHONE).length;
    const cost = await walk(['4', '3', '2', '1', '25000', '1']);
    expect(cost.replies[3]).toMatch(/^CON Aina ya gharama\n1\. Mbegu\n2\. Kamba/);
    expect(cost.replies[5]).toBe('CON Thibitisha gharama ya TSh 25,000 (Mbegu) kwa FARM002?\n1. Ndiyo\n2. Hapana');
    expect(cost.last).toBe('END Asante. Gharama ya TSh 25,000 imerekodiwa kwa FARM002.');
    expect(await farmRecords(prisma, 'COST').findFirst({ where: { farmId: farm.id, channel: 'USSD' }, orderBy: { createdAt: 'desc' } })).toMatchObject({ category: 'SEEDLINGS', amountTzs: 25000 });
    await flushBackground();
    expect(fake.to(PHONE).length).toBe(smsBefore + 1);
    expect(fake.to(PHONE).at(-1).message).toBe(`MWANIMLINZI: ${cost.last.slice(4)}`);
    const cancelled = await walk(['4', '3', '2', '1', '9000', '2']);
    expect(cancelled.last).toBe('END Gharama haijarekodiwa.');
    await flushBackground();
    expect(fake.to(PHONE).length).toBe(smsBefore + 1);

    const work = await walk(['4', '4', '2', '3']);
    expect(work.replies[3]).toMatch(/^CON Kazi gani\?\n1\. Kupanda/);
    expect(work.last).toBe('END Asante. Kazi ya leo imerekodiwa kwa FARM002: Kusafisha mistari.');
    expect(await farmRecords(prisma, 'WORK').findFirst({ where: { farmId: farm.id, channel: 'USSD' }, orderBy: { createdAt: 'desc' } })).toMatchObject({ activity: 'CLEANING_LINES' });
    await flushBackground();
    expect(fake.to(PHONE).length).toBe(smsBefore + 2);
    expect(fake.to(PHONE).at(-1).message).toBe(`MWANIMLINZI: ${work.last.slice(4)}`);
  });

  test('4 → 2 → a sale total too large to store re-prompts for the price (never half-saved)', async () => {
    const { replies } = await walk(['4', '2', '2', '100000', '1000000']);
    expect(replies[5]).toMatch(/Bei si sahihi/);
  });

  test('1 → 3 → a season with more costs than income says "Hasara" (loss), not a negative profit', async () => {
    const farm001 = await prisma.farm.findUnique({ where: { farmCode: 'FARM001' } });
    const cycle = await prisma.plantingCycle.findFirst({ where: { farmId: farm001.id }, orderBy: { plantingDate: 'desc' } });
    await farmRecords(prisma, 'COST').create({ data: { farmId: farm001.id, plantingCycleId: cycle.id, costDate: new Date(), category: 'LABOUR', amountTzs: 9000000 } });
    const { last } = await walk(['1', '3', '1']);
    expect(last).toMatch(/\nHasara: TSh [\d,]+/);
    expect(last).not.toMatch(/-TSh/);
  });

  test('1 → 3 → season profit from the farmer\'s own records', async () => {
    await flushBackground();
    const smsBefore = fake.to(PHONE).length;
    const { last } = await walk(['1', '3', '2']);
    expect(last).toMatch(/^END FARM002 msimu huu\nMapato: TSh [\d,]+\nGharama: TSh [\d,]+\nFaida: -?TSh [\d,]+/);
    expect(last.length).toBeLessThanOrEqual(186);
    await flushBackground();
    expect(fake.to(PHONE).length).toBe(smsBefore + 1);
    expect(fake.to(PHONE).at(-1).message).toMatch(/^MWANIMLINZI: FARM002 msimu huu\nMapato: TSh [\d,]+\nGharama: TSh [\d,]+\nFaida: /);
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
    const morning = new Date(`${localDate()}T08:00:00+03:00`);
    const originalCurrent = SeaOutlookService.currentForFarm.bind(SeaOutlookService);
    const clock = jest.spyOn(SeaOutlookService, 'currentForFarm').mockImplementation((farm, options = {}) => originalCurrent(farm, { now: morning, ...options }));
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
      await SeaOutlookService.refreshForFarm(await prisma.farm.findUnique({ where: { id: farm002.id } }), { now: morning });
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
      clock.mockRestore();
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

  // A farmer on a basic phone cannot re-open a closed USSD screen. These echoes give them a keepable copy
  // by SMS of every read-only screen (alerts, risk, outlook, advice), plus a welcome SMS on registration.
  describe('SMS echo for basic-phone farmers', () => {
    test('2 → alerts also sends the alert messages by SMS', async () => {
      const before = fake.to(PHONE).length;
      const { last } = await walk(['2']);
      expect(last).toMatch(/^END Tahadhari\n/);
      await flushBackground();
      const echo = fake.to(PHONE).slice(before).at(-1);
      expect(echo?.message).toMatch(/^MWANIMLINZI: Tahadhari za shamba lako:\n- /);
      expect(echo.message).toMatch(/FARM00[12]/);
      const log = await events(prisma, 'DELIVERY').findFirst({ where: { recipient: PHONE, messageType: 'SMS_REPLY' }, orderBy: { createdAt: 'desc' } });
      expect(log.message).toBe(echo.message);
    });

    test('1 → 1 → risk also sends the risk and action by SMS', async () => {
      const before = fake.to(PHONE).length;
      const { last } = await walk(['1', '1', '1']);
      expect(last).toMatch(/^END FARM001\nHatari: /);
      await flushBackground();
      const echo = fake.to(PHONE).slice(before).at(-1);
      expect(echo?.message).toMatch(/^MWANIMLINZI: FARM001 - Hatari: (NDOGO|YA KATI|KUBWA|KUBWA SANA)/);
    });

    test('5 → 1 → advice also sends the recommended action by SMS', async () => {
      const before = fake.to(PHONE).length;
      const { last } = await walk(['5', '1', '1']);
      expect(last).toMatch(/^END FARM001/);
      await flushBackground();
      const echo = fake.to(PHONE).slice(before).at(-1);
      if (/Hatua: /.test(last)) expect(echo?.message).toMatch(/^MWANIMLINZI: Ushauri kwa FARM001\. Hatua: /);
      else expect(echo?.message).toBe(`MWANIMLINZI: ${last.slice(4)}`);
    });

    test('USSD registration confirms the number with a welcome SMS carrying the farm code', async () => {
      const beforeAll = fake.sent.length;
      const { phoneNumber, last } = await onboardUssdFarmer();
      expect(last).toMatch(/^CON Umesajiliwa MwaniMlinzi\./);
      await flushBackground();
      const welcome = fake.sent.slice(beforeAll).find((m) => m.to === phoneNumber);
      expect(welcome).toBeTruthy();
      expect(welcome.message).toMatch(/^Karibu MwaniMlinzi\. Umesajiliwa\. Shamba lako ni FARM\d+\./);
    });

    test('completed screens send an English SMS even when a new farm has no data', async () => {
      const { phoneNumber } = await onboardUssdFarmer(unknownPhone(), ['2', '1', '', 'New Farmer', '4', 'Unmapped place', '1', '120']);
      await flushBackground();
      const latest = jest.spyOn(RiskService, 'latestForFarm').mockResolvedValue({
        predictions: [{ riskType: 'HEAT_ICE_ICE', insufficientData: true }], nextAction: null,
      });
      try {
        for (const inputs of [['2'], ['1', '1'], ['1', '2'], ['1', '3'], ['5', '1']]) {
          const before = fake.to(phoneNumber).length;
          const { sessionId, last } = await walk(inputs, { phoneNumber });
          expect(last).toMatch(/^END /);
          await flushBackground();
          const messages = fake.to(phoneNumber).slice(before);
          expect(messages).toHaveLength(1);
          expect(messages[0].message).toBe(`MWANIMLINZI: ${last.slice(4)}`);
          expect((await ussd(sessionId, inputs.join('*'), { phoneNumber })).text).toBe(last);
          await flushBackground();
          expect(fake.to(phoneNumber).length).toBe(before + 1);
        }
      } finally {
        latest.mockRestore();
      }
    });

    test('navigation and cancelled sales send no SMS receipt', async () => {
      await flushBackground();
      const before = fake.to(PHONE).length;
      await walk(['1']);
      await walk(['4', '2', '2', '10', '1000', '2']);
      await flushBackground();
      expect(fake.to(PHONE).length).toBe(before);
    });

    test('menu 2 falls back to the current risk summary when there are no alert rows yet', async () => {
      // Resolve any active alert for this farmer's farms; the fallback should list each farm's current
      // risk from RiskPrediction, so a basic-phone farmer always sees the real state (never a blank screen).
      const user = await prisma.user.findUnique({ where: { phone: PHONE }, include: { farmer: { include: { farms: true } } } });
      const farmIds = user.farmer.farms.map((f) => f.id);
      await prisma.alert.updateMany({ where: { farmId: { in: farmIds }, isSimulation: false, status: { not: 'RESOLVED' } }, data: { status: 'RESOLVED' } });
      const before = fake.to(PHONE).length;
      const { last } = await walk(['2']);
      expect(last).toMatch(/^END Tahadhari\n- FARM00\d: (NDOGO|YA KATI|KUBWA|KUBWA SANA)/);
      await flushBackground();
      const echo = fake.to(PHONE).slice(before).at(-1);
      expect(echo?.message).toMatch(/^MWANIMLINZI: Tahadhari za shamba lako:\n- FARM00\d: /);
    });
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
    const log = await events(prisma, 'DELIVERY').findFirst({ where: { messageType: 'SMS_REPLY' }, orderBy: { createdAt: 'desc' } });
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
    let log = await events(prisma, 'DELIVERY').findUnique({ where: { id: sent.logId } });
    expect(log.status).toBe('DELIVERED');
    expect(log.deliveredAt).toBeTruthy();
    expect((await delivery({ id: sent.providerRef, status: 'Success' })).text).toBe('DUPLICATE');
    expect((await delivery({ id: sent.providerRef, status: 'Buffered' })).text).toBe('ALREADY_FINAL');
    log = await events(prisma, 'DELIVERY').findUnique({ where: { id: sent.logId } });
    expect(log.status).toBe('DELIVERED');
    expect((await delivery({ id: 'unknown-id', status: 'Failed' })).text).toBe('UNKNOWN_MESSAGE');
    const failed = await SMSService.sendRaw(PHONE, 'test 2', { type: 'ADMIN_TEST' });
    await delivery({ id: failed.providerRef, status: 'Failed', failureReason: 'UserInBlacklist' });
    expect(await events(prisma, 'DELIVERY').findUnique({ where: { id: failed.logId } })).toMatchObject({ status: 'FAILED', error: 'UserInBlacklist' });
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
  test('answers from real risk factors and does not call unvalidated guidance approved', async () => {
    const t = await login('farmer');
    const farm = await farmByCode(t, 'FARM001');
    const why = await api().post('/api/ai/chat').set(auth(t)).send({ message: 'Kwa nini hatari yangu iko juu?', farmId: farm.id });
    expect(why.status).toBe(200);
    expect(why.body.data.intent).toBe('WHY_RISK');
    expect(why.body.data.language).toBe('sw');
    expect(why.body.data.reply).toMatch(/Joto la uso wa bahari/);
    expect(why.body.data.generatedBy).toBe('TEMPLATE');
    const todo = await api().post('/api/ai/chat').set(auth(t)).send({ message: 'Nifanye nini?', farmId: farm.id });
    expect(todo.body.data.approvedAction).toBeNull();
    expect(todo.body.data.generatedBy).toBe('TEMPLATE');
  });
  test('refuses to invent treatments', async () => {
    const t = await login('farmer');
    const res = await api().post('/api/ai/chat').set(auth(t)).send({ message: 'What medicine should I use?' });
    expect(res.body.data.intent).toBe('TREATMENT');
    expect(res.body.data.reply).toMatch(/contact an administrator/);
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
