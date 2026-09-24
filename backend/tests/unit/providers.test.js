import { EnvironmentalProvider } from '../../src/providers/environmentalProvider.js';
import { DemoWeatherProvider } from '../../src/providers/weatherProvider.js';
import { DemoOceanProvider, createLiveOceanProvider } from '../../src/providers/oceanProvider.js';
import { createLiveWeatherProvider } from '../../src/providers/weatherProvider.js';
import { createLLMProvider, TemplateLLMProvider } from '../../src/providers/llmProvider.js';
import { AfricasTalkingSMSClient } from '../../src/providers/africastalking/smsClient.js';
import { forecastForCycle, HarvestForecastService } from '../../src/services/harvestForecastService.js';
import { harvestMetrics, feedbackTypeFor } from '../../src/services/recordService.js';
import { applyOverrides } from '../../src/services/farmContextService.js';

const loc = { latitude: -6.27, longitude: 39.55, profile: 'NORMAL' };
const failing = (name) => ({ name, isLive: true, fetch: async () => { throw new Error('network down'); } });
const working = (name, data) => ({ name, isLive: true, fetch: async () => data });

describe('EnvironmentalProvider fallback (LIVE → CACHED → DEMO)', () => {
  test('uses LIVE when the live provider works', async () => {
    const p = new EnvironmentalProvider({ weatherLive: working('w', { rainfallMm: 3 }), oceanLive: working('o', { waveHeightM: 1 }) });
    const r = await p.fetch(loc);
    expect(r.weather.source).toBe('LIVE');
    expect(r.ocean.source).toBe('LIVE');
  });
  test('falls back to CACHED when live fails and cache exists', async () => {
    const p = new EnvironmentalProvider({ weatherLive: failing('w'), oceanLive: failing('o'), cacheLookup: async () => ({ rainfallMm: 2, waveHeightM: 0.5, provider: 'x' }) });
    const r = await p.fetch(loc);
    expect(r.weather.source).toBe('CACHED');
    expect(r.ocean.source).toBe('CACHED');
    expect(r.weather.errors[0]).toMatch(/network down/);
  });
  test('falls back to DEMO when live fails and nothing is cached', async () => {
    const p = new EnvironmentalProvider({ weatherLive: failing('w'), oceanLive: failing('o') });
    const r = await p.fetch(loc);
    expect(r.weather.source).toBe('DEMO');
    expect(r.ocean.source).toBe('DEMO');
    expect(r.ocean.seaSurfaceTempC).toBeGreaterThan(20);
  });
  test('uses DEMO directly when no live provider is configured', async () => {
    const p = new EnvironmentalProvider({ weatherLive: null, oceanLive: null });
    const r = await p.fetch(loc);
    expect(r.weather.provider).toBe(new DemoWeatherProvider().name);
    expect(r.ocean.provider).toBe(new DemoOceanProvider().name);
  });
  test('demo scenarios are distinct and deterministic', async () => {
    const d = new DemoOceanProvider();
    const heat = await d.fetch({ ...loc, profile: 'HEAT' });
    const normal = await d.fetch(loc);
    expect(heat.sstAnomalyC).toBeGreaterThan(normal.sstAnomalyC);
    expect(await d.fetch({ ...loc, profile: 'HEAT', at: heat.observedAt })).toEqual(await d.fetch({ ...loc, profile: 'HEAT', at: heat.observedAt }));
  });
  test('DEMO_MODE or missing credentials disable live providers', () => {
    expect(createLiveWeatherProvider({ demoMode: true, weather: { provider: 'open-meteo' } })).toBeNull();
    expect(createLiveWeatherProvider({ demoMode: false, weather: { provider: 'open-meteo' } }).name).toBe('open-meteo');
    expect(createLiveWeatherProvider({ demoMode: false, weather: { provider: 'openweathermap', apiKey: '' } })).toBeNull();
    expect(createLiveOceanProvider({ demoMode: false, ocean: { provider: 'open-meteo-marine' } }).name).toBe('open-meteo-marine');
  });
  test('LLM falls back to templates without keys; SMS reports NOT_CONFIGURED (never simulated success)', async () => {
    expect(createLLMProvider({ llm: { provider: 'anthropic', apiKey: '' } })).toBeInstanceOf(TemplateLLMProvider);
    expect(createLLMProvider({ llm: { provider: 'anthropic', apiKey: 'k' } }).name).toBe('anthropic');
    const sms = new AfricasTalkingSMSClient({ username: '', apiKey: '', environment: 'sandbox' });
    expect(sms.configured).toBe(false);
    expect((await sms.send('+255777000001', 'hi')).status).toBe('NOT_CONFIGURED');
  });
});

describe('harvest forecast + records math', () => {
  const cycle = { linesPlanted: 100, plantingDate: new Date(Date.now() - 30 * 86400000), expectedHarvestDate: new Date(Date.now() + 15 * 86400000) };
  const species = { yieldKgDryPerLine: 1.3 };
  test('risk-adjusted quantity is lower than expected and the range brackets it', () => {
    const low = forecastForCycle({ farm: { lineCount: 100 }, cycle, species, latestRisks: {}, history: { harvestCount: 0 } });
    const risky = forecastForCycle({ farm: { lineCount: 100 }, cycle, species, latestRisks: { HEAT_ICE_ICE: { probability: 0.9, confidence: 0.8 } }, history: { harvestCount: 3, yieldPerLine: 1.1 } });
    expect(low.expectedQuantityKg).toBe(130);
    expect(risky.expectedQuantityKg).toBe(110);
    expect(risky.riskAdjustedQuantityKg).toBeLessThan(risky.expectedQuantityKg);
    expect(risky.lowQuantityKg).toBeLessThanOrEqual(risky.riskAdjustedQuantityKg);
    expect(risky.highQuantityKg).toBeGreaterThanOrEqual(risky.riskAdjustedQuantityKg);
    expect(risky.inputs.yieldSource).toBe('FARM_HISTORY');
    expect(risky.confidence).toBeGreaterThan(low.confidence);
  });
  test('aggregate buckets by horizon', () => {
    const mk = (days, kg) => ({ expectedHarvestDate: new Date(Date.now() + days * 86400000), expectedQuantityKg: kg, riskAdjustedQuantityKg: kg, lowQuantityKg: kg * 0.8, highQuantityKg: kg * 1.1, confidence: 0.7, district: 'Kusini' });
    const agg = HarvestForecastService.aggregate([mk(3, 100), mk(10, 200), mk(25, 300), mk(60, 400)]);
    expect(agg.horizons.next7Days.riskAdjustedKg).toBe(100);
    expect(agg.horizons.next14Days.riskAdjustedKg).toBe(300);
    expect(agg.horizons.next30Days.riskAdjustedKg).toBe(600);
    expect(agg.horizons.all.farms).toBe(4);
  });
  test('harvest difference and loss %', () => {
    expect(harvestMetrics({ estimatedQuantity: 200, actualQuantity: 150, pricePerKg: 1000 })).toEqual({ differenceQuantity: -50, lossPercent: 25, totalValue: 150000 });
    expect(harvestMetrics({ estimatedQuantity: null, actualQuantity: 150 }).lossPercent).toBeNull();
  });
  test('feedback labelling compares prediction with outcome', () => {
    expect(feedbackTypeFor('HIGH', true)).toBe('CORRECT');
    expect(feedbackTypeFor('CRITICAL', false)).toBe('FALSE_POSITIVE');
    expect(feedbackTypeFor('LOW', true)).toBe('FALSE_NEGATIVE');
    expect(feedbackTypeFor('MEDIUM', false)).toBe('CORRECT');
  });
  test('simulation overrides are applied in-memory and labelled SIMULATION', () => {
    const env = applyOverrides({ seaSurfaceTempC: 26.1, sstAnomalyC: 0.1, sstAnomalyDays: 0, waveHeightM: 0.5, source: 'DEMO' }, { sstAnomalyC: 1.6, waveHeightM: 2 });
    expect(env.source).toBe('SIMULATION');
    expect(env.seaSurfaceTempC).toBeCloseTo(27.6, 2);
    expect(env.sstAnomalyDays).toBe(1);
    expect(env.waveHeightM).toBe(2);
  });
});
