import { OpenMeteoOutlookProvider } from '../../src/server/providers/outlookProvider.js';
import { SeaOutlookService } from '../../src/server/services/seaOutlookService.js';
import { simpleReason } from '../../src/server/ai/simpleReasons.js';
import { ActionEngine } from '../../src/server/ai/actionEngine.js';
import { ACTION_LIBRARY } from '../../prisma/data/actionLibrary.js';
import prisma from '../../src/server/config/prisma.js';

afterAll(() => prisma.$disconnect());

const times = Array.from({ length: 72 }, (_, i) => `2026-10-${String(2 + Math.floor(i / 24)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00`);
const rowAt = new Date('2026-10-02T09:00:00Z');
const row = (current = null) => ({ fetchedAt: rowAt, rainFetchedAt: rowAt, tideFetchedAt: null, tides: null,
  rainProvider: 'open-meteo', tideProvider: null,
  drying: { version: 'hourly-outlook-v2', days: [2, 3, 4].map((day) => ({ date: `2026-10-0${day}`, verdict: 'BAD', level: 'HIGH', maxRainProbability: 86, rainMm: 0.6 })),
    hourly: { times, probability: times.map(() => 86), mm: times.map(() => 0) }, current } });

test('live API current precipitation is independent of future rain probability and has an API timestamp', async () => {
  const request = async (url) => {
    expect(url.searchParams.get('current')).toContain('precipitation');
    expect(url.searchParams.get('latitude')).toBe('-6.3');
    expect(url.searchParams.get('timeformat')).toBe('unixtime');
    return { hourly: { time: [1790931600], precipitation_probability: [86], precipitation: [0.2] },
      current: { time: 1790931600, interval: 900, precipitation: 0, temperature_2m: 27, weather_code: 2 } };
  };
  const provider = new OpenMeteoOutlookProvider({ tideEnabled: false, request });
  const result = await provider.fetch({ latitude: -6.3, longitude: 39.3 });
  expect(result.rain.current).toMatchObject({ precipitationMm: 0, intervalMinutes: 15, dataKind: 'MODEL_ESTIMATE' });
  expect(result.rain.current.observedAt).toBe(new Date(1790931600000).toISOString());
  expect(result.rain.probability).toEqual([86]);
  expect(result.rain.times[0]).toMatch(/T\d\d:\d\d$/);
});

test('the API does not manufacture current weather when precipitation or timestamp is absent', async () => {
  const provider = new OpenMeteoOutlookProvider({ tideEnabled: false, request: async () => ({ hourly: { time: [1790931600], precipitation_probability: [86] }, current: { interval: 900, weather_code: 2 } }) });
  expect((await provider.fetch({ latitude: -6.3, longitude: 39.3 })).rain.current).toBeNull();
});

test('current dry weather and a high future rain chance can be displayed together without inventing observed rain', async () => {
  const current = { observedAt: rowAt.toISOString(), precipitationMm: 0, intervalMinutes: 15, dataKind: 'MODEL_ESTIMATE' };
  const result = await SeaOutlookService.serialize(row(current), { now: new Date('2026-10-02T09:05:00Z') });
  expect(result.current.precipitationMm).toBe(0);
  expect(result.today.drying).toMatchObject({ maxRainProbability: 86, windowStart: '2026-10-02T13:00' });
  expect((await SeaOutlookService.serialize(row(current), { now: new Date('2026-10-02T09:45:00Z') })).current).toBeNull();
});

test('after drying hours the card removes today and its advice, retaining future forecasts', async () => {
  const result = await SeaOutlookService.serialize(row(), { now: new Date('2026-10-02T19:00:00Z') });
  expect(result.today).toMatchObject({ drying: null, advice: null, dryingDayEnded: true });
  expect(result.days.map((day) => day.date)).toEqual(['2026-10-03', '2026-10-04']);
});

test('mixed cache timestamps cannot present expired rain as recently fetched weather', async () => {
  const mixed = { ...row(), rainFetchedAt: new Date('2026-09-29T09:00:00Z'), fetchedAt: rowAt,
    tides: [{ time: '2026-10-03T12:00', type: 'LOW', daylight: true, window: { start: '2026-10-03T11:00', end: '2026-10-03T13:00' } }], tideFetchedAt: rowAt };
  const result = await SeaOutlookService.serialize(mixed, { now: rowAt });
  expect(result.days).toEqual([]);
  expect(result.today.drying).toBeNull();
  expect(result.current).toBeNull();
});

test('risk explanations preserve moderate exposure and do not claim an unreported anchor condition', () => {
  expect(simpleReason('FARM_EXPOSURE', 'INCREASES', { exposureScore: 0.5 }).en).toContain('moderately exposed');
  expect(simpleReason('ANCHORING').en).not.toContain('are weak');
  expect(simpleReason('GEAR_CONDITION').en).toContain('were reported');
});

test('reported damage requires inspection despite a low storm score; no damage keeps ordinary monitoring', () => {
  const library = ACTION_LIBRARY.map((action) => ({ enabled: true, cropStage: 'ANY', priority: 0, ...action }));
  const risk = { riskType: 'STORM_LINE_DAMAGE', level: 'LOW', insufficientData: false };
  expect(ActionEngine.select(risk, { obsDamageReported: 1 }, library).code).toBe('STORM_LOW_REPORTED_DAMAGE');
  expect(ActionEngine.select(risk, { obsDamageReported: 0 }, library).code).toBe('STORM_LOW_MONITOR');
});
