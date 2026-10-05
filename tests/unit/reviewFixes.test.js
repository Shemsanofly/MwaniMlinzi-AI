import path from 'node:path';
import { jest } from '@jest/globals';
import { resolveModelPath, MODELS_DIR } from '../../src/server/ai/paths.js';
import { OpenMeteoWeatherProvider } from '../../src/server/providers/weatherProvider.js';
import { OpenMeteoMarineProvider } from '../../src/server/providers/oceanProvider.js';
import { OpenMeteoOutlookProvider, createOutlookProvider } from '../../src/server/providers/outlookProvider.js';

describe('model path guard', () => {
  test('accepts files inside the models directory', () => {
    expect(resolveModelPath(path.join(MODELS_DIR, 'HEAT_ICE_ICE_v1.json'))).toBe(path.join(MODELS_DIR, 'HEAT_ICE_ICE_v1.json'));
  });
  test('rejects prefix-collision and traversal paths', () => {
    expect(() => resolveModelPath(`${MODELS_DIR}_backup/model.json`)).toThrow(/outside/);
    expect(() => resolveModelPath(path.join(MODELS_DIR, '..', 'secret.json'))).toThrow(/outside/);
  });
});

describe('live providers with missing forecast values', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });
  const respond = (body) => { global.fetch = jest.fn(async () => ({ ok: true, json: async () => body })); };

  test('all-null daily arrays give null, not -Infinity', async () => {
    respond({ current: { temperature_2m: 27 }, daily: { precipitation_sum: [null, null], wind_speed_10m_max: [null] } });
    const w = await new OpenMeteoWeatherProvider().fetch({ latitude: -6, longitude: 39 });
    expect(w.rainfallMm).toBeNull();
    expect(w.windSpeedKmh).toBeNull();
    respond({ current: {}, daily: { wave_height_max: [null] } });
    const o = await new OpenMeteoMarineProvider().fetch({ latitude: -6, longitude: 39 });
    expect(o.waveHeightM).toBeNull();
  });
});

describe('Open-Meteo outlook provider (tides + drying rain)', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });
  const route = (handlers) => {
    global.fetch = jest.fn(async (url) => {
      const h = handlers.find(([host]) => String(url).includes(host));
      if (!h || h[1] === 'fail') return { ok: false, status: 503, text: async () => 'down' };
      return { ok: true, json: async () => h[1] };
    });
  };
  const times = ['2026-09-30T11:00', '2026-09-30T12:00', '2026-09-30T13:00'];

  test('parses sea level and rain series requested in local Zanzibar time', async () => {
    route([
      ['marine-api', { hourly: { time: times, sea_level_height_msl: [-1.1, -1.2, -1.0] } }],
      ['api.open-meteo.com', { hourly: { time: times, precipitation_probability: [10, 20, 15], precipitation: [0, 0, 0.1] } }],
    ]);
    const r = await new OpenMeteoOutlookProvider().fetch({ latitude: -6.27, longitude: 39.56 });
    expect(r.tide).toEqual({ times, levels: [-1.1, -1.2, -1.0] });
    expect(r.rain).toEqual({ times, probability: [10, 20, 15], mm: [0, 0, 0.1], current: null });
    expect(r.providers).toEqual({ tide: 'open-meteo-marine', rain: 'open-meteo' });
    expect(String(global.fetch.mock.calls[0][0])).toMatch(/timezone=Africa%2FDar_es_Salaam/);
  });

  test('a failing or empty part is null with an error, the other part still works', async () => {
    route([['marine-api', 'fail'], ['api.open-meteo.com', { hourly: { time: times, precipitation_probability: [null, null, null], precipitation: [null, null, null] } }]]);
    const r = await new OpenMeteoOutlookProvider().fetch({ latitude: -6.27, longitude: 39.56 });
    expect(r.tide).toBeNull();
    expect(r.rain).toBeNull();
    expect(r.errors.tide).toMatch(/503/);
    expect(r.errors.rain).toMatch(/no values/);
  });

  test("'none' disables a part; both 'none' disables the provider", () => {
    expect(createOutlookProvider({ weather: { provider: 'none' }, ocean: { provider: 'none' } })).toBeNull();
    expect(createOutlookProvider({ weather: { provider: '' }, ocean: { provider: 'none' } })).toMatchObject({ tideEnabled: false, rainEnabled: true });
  });
});
