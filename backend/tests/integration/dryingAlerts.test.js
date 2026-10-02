import { events } from '../../src/db/records.js';
import { login, farmByCode } from '../helpers.js';
import prisma from '../../src/config/prisma.js';
import { setOutlookProvider, getOutlookProvider } from '../../src/services/seaOutlookService.js';
import { DryingAlertService } from '../../src/services/dryingAlertService.js';
import { setSMSClient, getSMSClient } from '../../src/services/smsService.js';
import { JOBS } from '../../src/jobs/jobs.js';
import { localDate } from '../../src/ai/seaOutlook.js';
import { FakeSMSClient } from '../fakes/smsClient.js';

afterAll(() => prisma.$disconnect());

const TEST_NOW = new Date(`${localDate()}T06:20:00+03:00`);
const PHONE = '+255777000001'; // fixture farmer owning FARM002 (1 day before expected harvest)

function localHours() {
  const [y, m, d] = localDate().split('-').map(Number);
  return Array.from({ length: 72 }, (_, i) => `${new Date(Date.UTC(y, m - 1, d + Math.floor(i / 24))).toISOString().slice(0, 10)}T${String(i % 24).padStart(2, '0')}:00`);
}
/** Rain chance per day during drying hours, e.g. [10, 80, 10] = dry today, wet tomorrow. */
const rainProvider = (dailyProbability) => ({
  async fetch() {
    const times = localHours();
    return {
      tide: null,
      rain: { times, probability: times.map((_, i) => dailyProbability[Math.floor(i / 24)]), mm: times.map(() => 0) },
      providers: { tide: 'open-meteo-marine', rain: 'open-meteo' },
      errors: {},
    };
  },
});

describe('drying-weather warnings (morning job)', () => {
  let originalProvider; let originalSms; let sms; let farm; let quiet;
  const dryingAlerts = (farmId) => prisma.alert.count({ where: { farmId, type: 'DRYING_WEATHER' } });
  // The fixture farmer owns FARM001 too (it qualifies once another test records a harvest there): count FARM002's only.
  const dryingSms = () => events(prisma, 'DELIVERY').findMany({ where: { messageType: 'DRYING_WARNING', recipient: PHONE, message: { contains: 'FARM002' } } });

  beforeAll(async () => {
    originalProvider = getOutlookProvider();
    originalSms = getSMSClient();
    sms = new FakeSMSClient();
    setSMSClient(sms);
    const farmer = await login('farmer');
    farm = await farmByCode(farmer, 'FARM002');
    quiet = await farmByCode(await login('admin'), 'FARM005'); // 20-day-old crop, far from harvest
  });
  beforeEach(async () => {
    await prisma.seaOutlook.deleteMany({});
    await prisma.alert.deleteMany({ where: { type: 'DRYING_WEATHER' } });
    await events(prisma, 'DELIVERY').deleteMany({ where: { messageType: 'DRYING_WARNING' } });
  });
  afterAll(() => { setOutlookProvider(originalProvider); setSMSClient(originalSms); });

  test('rain tomorrow on a farm about to harvest → one alert with approved advice and one SMS; repeat runs do not repeat it', async () => {
    setOutlookProvider(rainProvider([10, 80, 10]));
    const first = await DryingAlertService.run({ now: TEST_NOW });
    expect(first.alerts).toBeGreaterThanOrEqual(1);
    const alert = await prisma.alert.findFirst({ where: { farmId: farm.id, type: 'DRYING_WEATHER' } });
    expect(alert).toMatchObject({ severity: 'HIGH', isSimulation: false });
    expect(alert.messageSw).toMatch(/kesho/);
    expect(alert.messageSw).toMatch(/ardhini/); // DRY_HIGH_DELAY advice text from the Action Library
    expect(alert.messageSw).toMatch(/kesho \(\d\d\/\d\d\)/); // the date is in the text, so an old alert is never misread
    const logs = await dryingSms();
    expect(logs).toHaveLength(1);
    expect(logs[0].message).toMatch(/^MWANIMLINZI FARM002, kesho \d\d\/\d\d: Mvua inatarajiwa\./);
    expect(logs[0].message).not.toMatch(/Mvua inatarajiwa.*Mvua inatarajiwa/);
    expect(logs[0].message.length).toBeLessThanOrEqual(160); // one SMS segment

    await DryingAlertService.run({ now: TEST_NOW });
    expect(await dryingAlerts(farm.id)).toBe(1);
    expect(await dryingSms()).toHaveLength(1);
  });

  test('drying warnings from earlier days are resolved automatically (they are about a day that has passed)', async () => {
    const old = await prisma.alert.create({ data: { farmId: farm.id, type: 'DRYING_WEATHER', severity: 'HIGH', title: 'old', titleSw: 'old', message: 'old', messageSw: 'old', createdAt: new Date(Date.now() - 2 * 86400e3) } });
    setOutlookProvider(rainProvider([10, 10, 10]));
    await DryingAlertService.run({ now: TEST_NOW });
    expect((await prisma.alert.findUnique({ where: { id: old.id } })).status).toBe('RESOLVED');
  });

  test('farms far from harvest get no drying warning', async () => {
    setOutlookProvider(rainProvider([80, 80, 80]));
    await DryingAlertService.run({ now: TEST_NOW });
    expect(await dryingAlerts(quiet.id)).toBe(0);
  });

  test('dry forecast → no warning', async () => {
    setOutlookProvider(rainProvider([10, 20, 45]));
    await DryingAlertService.run({ now: TEST_NOW });
    expect(await dryingAlerts(farm.id)).toBe(0);
  });

  test('farmer turned harvest SMS off → in-app alert only, SMS skipped', async () => {
    await prisma.user.update({ where: { phone: PHONE }, data: { notifyHarvest: false } });
    try {
      setOutlookProvider(rainProvider([80, 10, 10]));
      await DryingAlertService.run({ now: TEST_NOW });
      expect((await prisma.alert.findFirst({ where: { farmId: farm.id, type: 'DRYING_WEATHER' } })).messageSw).toMatch(/leo/);
      expect(await dryingSms()).toHaveLength(0);
    } finally {
      await prisma.user.update({ where: { phone: PHONE }, data: { notifyHarvest: true } });
    }
  });

  test('morning schedule 06:00–06:30 (deck slide 7) plus a 14:00 refresh', () => {
    expect(JOBS['fetch-environment'].schedule).toBe('0 6,14 * * *');
    expect(JOBS['run-risk-predictions'].schedule).toBe('10 6,14 * * *');
    expect(JOBS['drying-alerts'].schedule).toBe('20 6 * * *');
    expect(JOBS['harvest-forecasts'].schedule).toBe('30 6,14 * * *');
  });
});
