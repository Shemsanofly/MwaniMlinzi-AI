import prisma from '../../src/config/prisma.js';
import { normalizeTzPhone, maskPhone } from '../../src/utils/phone.js';
import { AfricasTalkingSMSClient, mapDeliveryStatus } from '../../src/providers/africastalking/smsClient.js';
import { atPublicStatus } from '../../src/providers/africastalking/config.js';
import { SMSService, smsPolicy, smsText, setSMSClient, getSMSClient } from '../../src/services/smsService.js';
import { parseKg, fitScreen } from '../../src/services/ussdService.js';
import { simpleReason } from '../../src/ai/simpleReasons.js';
import { FakeSMSClient } from '../fakes/smsClient.js';

afterAll(() => prisma.$disconnect());

describe('Tanzanian phone normalisation', () => {
  test.each([
    ['+255777123456', '+255777123456'],
    ['255777123456', '+255777123456'],
    ['0777123456', '+255777123456'],
    ['0777 123 456', '+255777123456'],
    ['+255 (777) 123-456', '+255777123456'],
    ['00255777123456', '+255777123456'],
    ['777123456', '+255777123456'],
    ['0655123456', '+255655123456'],
  ])('%s → %s', (input, expected) => expect(normalizeTzPhone(input)).toBe(expected));

  test.each(['', null, '12345', '+254712345678', '0577123456', '07771234567', 'abc0777123456'])('rejects %s', (input) => {
    expect(normalizeTzPhone(input)).toBeNull();
  });

  test('masks phones for logs', () => expect(maskPhone('+255777123456')).not.toContain('123'));
});

const response = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
const recipient = (statusCode, status, messageId = 'ATXid_1') => ({ SMSMessageData: { Message: 'Sent to 1/1', Recipients: [{ statusCode, status, number: '+255777123456', messageId, cost: 'TZS 20' }] } });

describe("Africa's Talking SMS client", () => {
  const cfg = { username: 'sandbox', apiKey: 'test-key', environment: 'sandbox', senderId: '' };

  test('posts to the sandbox messaging endpoint with the API key header', async () => {
    let call;
    const fetchImpl = async (url, opts) => { call = { url, opts }; return response(201, recipient(101, 'Success')); };
    const r = await new AfricasTalkingSMSClient(cfg).send('+255777123456', 'Habari', { fetchImpl });
    expect(call.url).toBe('https://api.sandbox.africastalking.com/version1/messaging');
    expect(call.opts.headers.apiKey).toBe('test-key');
    expect(call.opts.body.get('username')).toBe('sandbox');
    expect(call.opts.body.get('to')).toBe('+255777123456');
    expect(call.opts.body.has('from')).toBe(false);
    expect(r).toMatchObject({ status: 'SENT', providerRef: 'ATXid_1' });
  });

  test('uses the production host and sender ID when configured', async () => {
    let call;
    const fetchImpl = async (url, opts) => { call = { url, opts }; return response(201, recipient(102, 'Queued')); };
    const r = await new AfricasTalkingSMSClient({ ...cfg, username: 'mwani', environment: 'production', senderId: 'MWANI' }).send('+255777123456', 'x', { fetchImpl });
    expect(call.url).toBe('https://api.africastalking.com/version1/messaging');
    expect(call.opts.body.get('from')).toBe('MWANI');
    expect(r.status).toBe('QUEUED');
  });

  test('never reports success it did not get', async () => {
    const client = new AfricasTalkingSMSClient(cfg);
    expect((await client.send('+255777123456', 'x', { fetchImpl: async () => response(201, recipient(403, 'InvalidPhoneNumber', 'None')) }))).toMatchObject({ status: 'FAILED', providerRef: null });
    const auth = await client.send('+255777123456', 'x', { fetchImpl: async () => response(401, 'The supplied authentication is invalid') });
    expect(auth.status).toBe('FAILED');
    expect(auth.error).toMatch(/Authentication failed/);
    expect((await client.send('+255777123456', 'x', { fetchImpl: async () => { throw new Error('ECONNRESET'); } })).status).toBe('FAILED');
    expect((await client.send('+255777123456', 'x', { fetchImpl: async () => response(200, '<html>') })).status).toBe('UNKNOWN');
    expect((await new AfricasTalkingSMSClient({ ...cfg, apiKey: '' }).send('+255777123456', 'x')).status).toBe('NOT_CONFIGURED');
  });

  test('delivery report statuses map to our statuses', () => {
    expect(mapDeliveryStatus('Success')).toBe('DELIVERED');
    expect(mapDeliveryStatus('Failed')).toBe('FAILED');
    expect(mapDeliveryStatus('Rejected')).toBe('FAILED');
    expect(mapDeliveryStatus('Buffered')).toBe('SENT');
    expect(mapDeliveryStatus('Weird')).toBe('UNKNOWN');
  });

  test('public status never contains the API key or callback secret', () => {
    const s = JSON.stringify(atPublicStatus({ ...cfg, callbackSecret: 'very-secret-value' }));
    expect(s).not.toContain('test-key');
    expect(s).not.toContain('very-secret-value');
    expect(JSON.parse(s)).toMatchObject({ environment: 'SANDBOX', apiKeySet: true, sms: 'CONFIGURED', ussd: 'CONFIGURED' });
  });
});

describe('SMS policy (opt-in, preferences, priority)', () => {
  const user = { id: 'u', phone: '+255777123456', preferredLanguage: 'sw', smsEnabled: true, notifyRiskAlerts: true, notifyHarvest: true, notifySystem: true };
  test('HIGH/CRITICAL risk alerts are sent, lower priorities are not', () => {
    expect(smsPolicy(user, { type: 'RISK_ALERT', priority: 'HIGH' }).allowed).toBe(true);
    expect(smsPolicy(user, { type: 'RISK_ALERT', priority: 'CRITICAL' }).allowed).toBe(true);
    expect(smsPolicy(user, { type: 'RISK_ALERT', priority: 'WARNING' })).toEqual({ allowed: false, reason: 'PRIORITY_TOO_LOW' });
  });
  test('user switches are respected', () => {
    expect(smsPolicy({ ...user, smsEnabled: false }, { type: 'RISK_ALERT', priority: 'CRITICAL' }).reason).toBe('SMS_DISABLED_BY_USER');
    expect(smsPolicy({ ...user, notifyRiskAlerts: false }, { type: 'RISK_ALERT', priority: 'CRITICAL' }).reason).toBe('PREFERENCE_OFF');
    expect(smsPolicy({ ...user, notifyHarvest: false }, { type: 'HARVEST_REMINDER' }).reason).toBe('PREFERENCE_OFF');
    expect(smsPolicy({ ...user, notifySystem: false }, { type: 'SYSTEM' }).reason).toBe('PREFERENCE_OFF');
    expect(smsPolicy({ ...user, phone: null }, { type: 'SYSTEM' }).reason).toBe('NO_VALID_PHONE');
  });
  test('long messages are cut to two SMS segments', () => {
    expect(smsText('x'.repeat(500)).length).toBe(306);
  });
});

describe('SMSService (with a fake provider)', () => {
  let original;
  const fake = new FakeSMSClient();
  beforeAll(() => { original = getSMSClient(); setSMSClient(fake); });
  afterAll(() => setSMSClient(original));

  test("sends in the user's language and logs the provider result", async () => {
    const u = await prisma.user.findUnique({ where: { phone: '+255777000004' } }); // demo farmer with English preference
    expect(u.preferredLanguage).toBe('en');
    const r = await SMSService.sendHarvestReminder(u, { text: { en: 'Harvest soon', sw: 'Vuna hivi karibuni' } });
    expect(r.status).toBe('QUEUED');
    expect(fake.sent.at(-1)).toEqual({ to: '+255777000004', message: 'Harvest soon' });
    const log = await prisma.notificationLog.findUnique({ where: { id: r.logId } });
    expect(log).toMatchObject({ channel: 'SMS', status: 'QUEUED', messageType: 'HARVEST_REMINDER', language: 'en', recipient: '+255777000004', provider: 'fake-africastalking' });
    expect(log.sentAt).toBeTruthy();
  });

  test('provider failure is recorded as FAILED with the reason', async () => {
    fake.nextStatus = 'FAILED';
    const r = await SMSService.sendRaw('0777000004', 'x', { type: 'ADMIN_TEST' });
    fake.nextStatus = 'QUEUED';
    expect(r.status).toBe('FAILED');
    const log = await prisma.notificationLog.findUnique({ where: { id: r.logId } });
    expect(log.error).toMatch(/InvalidPhoneNumber/);
    expect(log.sentAt).toBeNull();
  });

  test('skips (does not send) when the user opted out', async () => {
    const before = fake.sent.length;
    const u = await prisma.user.findUnique({ where: { phone: '+255777000004' } });
    const r = await SMSService.sendRiskAlert({ ...u, smsEnabled: false }, { priority: 'CRITICAL', text: { en: 'x', sw: 'x' } });
    expect(r).toEqual({ status: 'SKIPPED', reason: 'SMS_DISABLED_BY_USER' });
    expect(fake.sent.length).toBe(before);
  });
});

describe('USSD helpers + simple reasons', () => {
  test('kg parsing validates the amount', () => {
    expect(parseKg('120')).toBe(120);
    expect(parseKg('12,5')).toBe(12.5);
    for (const bad of ['', 'abc', '0', '-5', '1e3', '200000', '12.345']) expect(parseKg(bad)).toBeNull();
  });
  test('screens are kept within USSD length', () => {
    expect(fitScreen('x'.repeat(400)).length).toBeLessThanOrEqual(182);
  });
  test('every factor has a plain-language reason in both languages', () => {
    expect(simpleReason('SST_ANOMALY', 'INCREASES')).toEqual({ en: 'The sea is warmer than normal', sw: 'Maji ya bahari yana joto kuliko kawaida' });
    expect(simpleReason('UNKNOWN_CODE')).toBeNull();
  });
});
