import path from 'node:path';
import { jest } from '@jest/globals';
import { resolveModelPath, MODELS_DIR } from '../../src/ai/paths.js';
import { OpenMeteoWeatherProvider } from '../../src/providers/weatherProvider.js';
import { OpenMeteoMarineProvider } from '../../src/providers/oceanProvider.js';
import { EnvironmentalProvider } from '../../src/providers/environmentalProvider.js';

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

  test('useLive=false skips live providers (environment.preferLive)', async () => {
    const live = { name: 'live', isLive: true, fetch: jest.fn(async () => ({ rainfallMm: 1 })) };
    const r = await new EnvironmentalProvider({ weatherLive: live, oceanLive: live }).fetch({ latitude: -6, longitude: 39 }, { useLive: false });
    expect(live.fetch).not.toHaveBeenCalled();
    expect(r.weather.source).toBe('DEMO');
  });
});
