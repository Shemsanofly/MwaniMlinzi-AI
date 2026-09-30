import { api, auth, login, farmByCode } from '../helpers.js';
import prisma from '../../src/config/prisma.js';
import { setOutlookProvider, getOutlookProvider } from '../../src/services/seaOutlookService.js';
import { localDate } from '../../src/ai/seaOutlook.js';

afterAll(() => prisma.$disconnect());

/** 72 local hourly times starting today 00:00 (Africa/Dar_es_Salaam). */
function localHours() {
  const [y, m, d] = localDate().split('-').map(Number);
  return Array.from({ length: 72 }, (_, i) => {
    const day = new Date(Date.UTC(y, m - 1, d + Math.floor(i / 24)));
    return `${day.toISOString().slice(0, 10)}T${String(i % 24).padStart(2, '0')}:00`;
  });
}

/** Tide: highs 05:00/17:00, lows 11:00/23:00. Rain: day 0 dry (GOOD), day 1 wet (BAD), day 2 showers (CAUTION). */
function fakeProvider({ fail = false } = {}) {
  const calls = [];
  return {
    calls,
    async fetch(loc) {
      calls.push(loc);
      if (fail) return { tide: null, rain: null, providers: { tide: 'open-meteo-marine', rain: 'open-meteo' }, errors: { tide: 'down', rain: 'down' } };
      const times = localHours();
      const levels = times.map((t) => Math.round(1.5 * Math.cos((2 * Math.PI * (Number(t.slice(11, 13)) - 5)) / 12) * 100) / 100);
      const prob = times.map((_, i) => [10, 80, 45][Math.floor(i / 24)]);
      return {
        tide: { times, levels },
        rain: { times, probability: prob, mm: times.map(() => 0) },
        providers: { tide: 'open-meteo-marine', rain: 'open-meteo' },
        errors: {},
      };
    },
  };
}

/** Make the stored outlook (and each of its parts) `hours` old. */
const ageStored = (farmId, hours) => {
  const at = new Date(Date.now() - hours * 3600e3);
  return prisma.seaOutlook.updateMany({ where: { farmId }, data: { fetchedAt: at, tideFetchedAt: at, rainFetchedAt: at } });
};

describe('GET /api/farms/:id/outlook — tides and drying weather', () => {
  let farmer; let farm; let original;
  beforeAll(async () => {
    original = getOutlookProvider();
    farmer = await login('farmer');
    farm = await farmByCode(farmer, 'FARM002');
  });
  afterEach(() => setOutlookProvider(original));

  test('live forecast: today\'s low tides, next daylight work window, drying verdicts and approved advice', async () => {
    const provider = fakeProvider();
    setOutlookProvider(provider);
    const res = await api().get(`/api/farms/${farm.id}/outlook`).set(auth(farmer));
    expect(res.status).toBe(200);
    const o = res.body.data.outlook;
    expect(o.source).toBe('LIVE');
    expect(o.providers).toEqual({ tide: 'open-meteo-marine', rain: 'open-meteo' });
    expect(o.today.date).toBe(localDate());
    expect(o.today.lowTides.map((t) => t.time.slice(11))).toEqual(['11:00', '23:00']);
    expect(o.today.nextWorkWindow.time).toMatch(/T11:00$/);
    expect(o.today.nextWorkWindow.daylight).toBe(true);
    expect(o.today.nextWorkWindow.window).toEqual(expect.objectContaining({ start: expect.stringMatching(/T(09|10):00$/), end: expect.stringMatching(/T(12|13):00$/) }));
    expect(o.today.drying).toMatchObject({ verdict: 'GOOD', level: 'LOW', maxRainProbability: 10 });
    expect(o.today.advice).toMatchObject({ code: 'DRY_LOW_OK', actionSw: expect.stringMatching(/ardhini/) });
    expect(o.days.map((d) => d.verdict)).toEqual(['GOOD', 'BAD', 'CAUTION']);
    expect(o.note.en).toMatch(/Forecast/);
    expect(provider.calls[0]).toMatchObject({ latitude: expect.any(Number), longitude: expect.any(Number) });

    // Served from the stored morning result: no second provider call within the freshness window.
    await api().get(`/api/farms/${farm.id}/outlook`).set(auth(farmer));
    expect(provider.calls).toHaveLength(1);
    expect(await prisma.seaOutlook.count({ where: { farmId: farm.id } })).toBe(1);
  });

  test('provider down: the last stored outlook (≤ 48 h) is served and labelled CACHED', async () => {
    await ageStored(farm.id, 8);
    setOutlookProvider(fakeProvider({ fail: true }));
    const o = (await api().get(`/api/farms/${farm.id}/outlook`).set(auth(farmer))).body.data.outlook;
    expect(o.source).toBe('CACHED');
    expect(o.today.drying.verdict).toBe('GOOD');
  });

  test('provider down: failed live fetches back off (no refetch on every request)', async () => {
    await ageStored(farm.id, 9);
    const provider = fakeProvider({ fail: true });
    setOutlookProvider(provider);
    for (let i = 0; i < 3; i += 1) {
      expect((await api().get(`/api/farms/${farm.id}/outlook`).set(auth(farmer))).body.data.outlook.source).toBe('CACHED');
    }
    expect(provider.calls).toHaveLength(1);
  });

  test('one part failing keeps the other part from the last saved reading and labels it', async () => {
    await prisma.seaOutlook.deleteMany({ where: { farmId: farm.id } });
    setOutlookProvider(fakeProvider());
    await api().get(`/api/farms/${farm.id}/outlook`).set(auth(farmer)); // complete row
    await prisma.seaOutlook.updateMany({ where: { farmId: farm.id }, data: { fetchedAt: new Date(Date.now() - 10 * 3600e3), tideFetchedAt: new Date(Date.now() - 10 * 3600e3), rainFetchedAt: new Date(Date.now() - 10 * 3600e3) } });
    const full = fakeProvider();
    setOutlookProvider({ calls: [], async fetch(loc) { const r = await full.fetch(loc); return { ...r, rain: null, errors: { rain: 'HTTP 503' } }; } });
    const o = (await api().get(`/api/farms/${farm.id}/outlook`).set(auth(farmer))).body.data.outlook;
    expect(o.today.drying.verdict).toBe('GOOD'); // carried over, not lost
    expect(o.days).toHaveLength(3);
    expect(o.source).toBe('CACHED'); // part of it is the last saved reading
    expect(o.today.lowTides.length).toBeGreaterThan(0);
  });

  test('never older than 48 h, even if the admin raised the environment cache age; nothing for today → null', async () => {
    await prisma.systemSetting.upsert({ where: { key: 'environment.maxCacheAgeHours' }, update: { value: 168 }, create: { key: 'environment.maxCacheAgeHours', value: 168 } });
    try {
      await prisma.seaOutlook.updateMany({ where: { farmId: farm.id }, data: { fetchedAt: new Date(Date.now() - 60 * 3600e3), tideFetchedAt: null, rainFetchedAt: null } });
      setOutlookProvider(fakeProvider({ fail: true }));
      expect((await api().get(`/api/farms/${farm.id}/outlook`).set(auth(farmer))).body.data.outlook).toBeNull();
    } finally {
      await prisma.systemSetting.update({ where: { key: 'environment.maxCacheAgeHours' }, data: { value: 48 } });
    }
    const yesterday = localDate(new Date(Date.now() - 86400e3));
    await prisma.seaOutlook.create({ data: { farmId: farm.id, fetchedAt: new Date(Date.now() - 20 * 3600e3), tides: [{ type: 'LOW', time: `${yesterday}T11:00`, levelM: -1, daylight: true, window: { start: `${yesterday}T10:00`, end: `${yesterday}T12:00` } }], drying: [{ date: yesterday, verdict: 'GOOD', level: 'LOW', maxRainProbability: 5, rainMm: 0 }] } });
    setOutlookProvider(fakeProvider({ fail: true }));
    expect((await api().get(`/api/farms/${farm.id}/outlook`).set(auth(farmer))).body.data.outlook).toBeNull();
  });

  test('provider down and nothing stored: no forecast (null), never invented values', async () => {
    const other = await farmByCode(farmer, 'FARM001');
    await prisma.seaOutlook.deleteMany({ where: { farmId: other.id } });
    setOutlookProvider(fakeProvider({ fail: true }));
    const res = await api().get(`/api/farms/${other.id}/outlook`).set(auth(farmer));
    expect(res.status).toBe(200);
    expect(res.body.data.outlook).toBeNull();
  });

  test('a farm without a map point has no outlook; other farmers\' farms are forbidden', async () => {
    const provider = fakeProvider();
    setOutlookProvider(provider);
    const owner = await prisma.farm.findUnique({ where: { id: farm.id }, select: { farmerId: true, speciesId: true } });
    const unmapped = await prisma.farm.create({ data: { farmCode: `FARMX${Date.now() % 100000}`, name: 'No map point', farmerId: owner.farmerId, speciesId: owner.speciesId } });
    const res = await api().get(`/api/farms/${unmapped.id}/outlook`).set(auth(farmer));
    expect(res.status).toBe(200);
    expect(res.body.data.outlook).toBeNull();
    expect(provider.calls).toHaveLength(0);

    const foreign = await farmByCode(await login('admin'), 'FARM003');
    expect((await api().get(`/api/farms/${foreign.id}/outlook`).set(auth(farmer))).status).toBe(403);
  });
});
