import { api, auth, login, farmByCode } from '../helpers.js';
import prisma from '../../src/config/prisma.js';

afterAll(() => prisma.$disconnect());
const PHONE = '+255777000001';

describe('SMS simulator', () => {
  test('RISK FARM001 returns Kiswahili risk + approved action', async () => {
    const res = await api().post('/api/sms/simulate').set(auth(await login('farmer'))).send({ from: PHONE, message: 'RISK FARM001' });
    expect(res.status).toBe(200);
    expect(res.body.data.reply).toMatch(/FARM001: Shamba lako lina hatari/);
    expect(res.body.data.reply).toMatch(/Hatua:/);
  });
  test('REPORT records an observation through SMS', async () => {
    const t = await login('farmer');
    const count = await prisma.farmObservation.count({ where: { channel: 'SMS' } });
    const res = await api().post('/api/sms/simulate').set(auth(t)).send({ from: PHONE, message: 'RIPOTI FARM002 NZURI' });
    expect(res.body.data.reply).toMatch(/Asante/);
    expect(await prisma.farmObservation.count({ where: { channel: 'SMS' } })).toBe(count + 1);
  });
  test('unregistered numbers and other farmers’ phones are handled', async () => {
    const admin = await login('admin');
    const res = await api().post('/api/sms/simulate').set(auth(admin)).send({ from: '+255700999999', message: 'RISK FARM001' });
    expect(res.body.data.reply).toMatch(/haijasajiliwa/);
    const farmer = await login('farmer');
    expect((await api().post('/api/sms/simulate').set(auth(farmer)).send({ from: '+255777000005', message: 'RISK FARM003' })).status).toBe(403);
  });
});

describe('USSD simulator (*123#)', () => {
  const t = () => login('farmer');
  const ussd = async (text, sessionId = `s-${Date.now()}`) => (await api().post('/api/ussd/simulate').set(auth(await t())).send({ sessionId, phoneNumber: PHONE, text })).body.data;

  test('main menu', async () => {
    const r = await ussd('');
    expect(r.response).toMatch(/^CON MwaniMlinzi/);
    expect(r.response).toMatch(/1\. Angalia Hatari/);
  });
  test('1 → pick farm → risk summary', async () => {
    expect((await ussd('1')).response).toMatch(/Chagua shamba/);
    const r = await ussd('1*1');
    expect(r.response).toMatch(/^END FARM001/);
    expect(r.response).toMatch(/Hatari ya joto\/ice-ice/);
  });
  test('2 → report symptoms through the state machine', async () => {
    expect((await ussd('2*1')).response).toMatch(/Hali ya mwani/);
    expect((await ussd('2*1*2')).response).toMatch(/mweupe/);
    const r = await ussd('2*1*2*1*2*2');
    expect(r.end).toBe(true);
    expect(r.response).toMatch(/ripoti imepokelewa/);
  });
  test('invalid option re-prompts', async () => {
    expect((await ussd('9')).response).toMatch(/Chaguo si sahihi/);
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
