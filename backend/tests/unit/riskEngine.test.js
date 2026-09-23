import { RiskEngine } from '../../src/ai/riskEngine.js';
import { RiskRuleEngine } from '../../src/ai/riskRuleEngine.js';
import { levelFor } from '../../src/ai/constants.js';
import { buildFeatures } from '../../src/ai/features.js';

const species = { typicalCycleDays: 45, heatSensitivity: 0.75, optimalSstMin: 25, optimalSstMax: 29 };
const baseCtx = (over = {}) => ({
  farm: { exposure: 'MODERATE', anchoringMethod: 'WOODEN_STAKES', species },
  cycle: { id: 'c1' },
  cropAgeDays: 39,
  expectedCycleDays: 45,
  environment: { seaSurfaceTempC: 26.2, sstAnomalyC: 0.1, sstAnomalyDays: 0, sstTrend7d: 0, waveHeightM: 0.6, windSpeedKmh: 14, currentVelocityMs: 0.25, rainfallMm: 1, salinityPsu: 34.5, chlorophyllMgM3: 0.35, humidityPct: 75, source: 'DEMO' },
  recentObservation: { cropCondition: 'GOOD', whitening: false, ageDays: 2 },
  history: { pastCycles: 2, iceIceLossRate: 0, stormLossRate: 0, yieldRatio: 1 },
  ...over,
});

describe('risk levels', () => {
  test('default thresholds map probabilities to levels', () => {
    expect(levelFor(0.1)).toBe('LOW');
    expect(levelFor(0.29)).toBe('LOW');
    expect(levelFor(0.3)).toBe('MEDIUM');
    expect(levelFor(0.6)).toBe('HIGH');
    expect(levelFor(0.8)).toBe('CRITICAL');
  });
  test('custom thresholds from settings are respected', () => {
    expect(levelFor(0.5, { MEDIUM: 0.2, HIGH: 0.45, CRITICAL: 0.9 })).toBe('HIGH');
  });
});

describe('RiskEngine (rule baseline)', () => {
  test('normal conditions give LOW risk for all types', async () => {
    const r = await RiskEngine.calculateFarmRisk(baseCtx());
    for (const risk of Object.values(r.risks)) expect(risk.level).toBe('LOW');
    expect(r.modelStatus.label).toBe('Rule-based baseline');
  });

  test('elevated SST + persistence + whitening at 39 days → HIGH or above heat risk with explained factors', async () => {
    const ctx = baseCtx({
      environment: { ...baseCtx().environment, seaSurfaceTempC: 27.4, sstAnomalyC: 1.4, sstAnomalyDays: 6, waveHeightM: 0.3 },
      recentObservation: { cropCondition: 'FAIR', whitening: true, percentAffected: 5, ageDays: 1 },
    });
    const r = await RiskEngine.calculateFarmRisk(ctx);
    const heat = r.risks.HEAT_ICE_ICE;
    expect(['HIGH', 'CRITICAL']).toContain(heat.level);
    const codes = heat.factors.map((f) => f.code);
    expect(codes).toEqual(expect.arrayContaining(['SST_ANOMALY', 'SST_PERSISTENCE', 'WHITENING_REPORTED', 'CROP_STAGE']));
    expect(heat.explanation).toMatch(/Heat \/ Ice-Ice risk/);
    expect(heat.explanationSw).toMatch(/Sababu kuu/);
    expect(heat.horizonHours).toBe(72);
  });

  test('risk rises monotonically with SST anomaly', async () => {
    const probs = [];
    for (const a of [0, 0.5, 1, 1.5, 2]) {
      const r = await RiskEngine.calculateFarmRisk(baseCtx({ environment: { ...baseCtx().environment, sstAnomalyC: a } }));
      probs.push(r.risks.HEAT_ICE_ICE.probability);
    }
    for (let i = 1; i < probs.length; i += 1) expect(probs[i]).toBeGreaterThan(probs[i - 1]);
  });

  test('storm risk responds to waves, wind and exposure', async () => {
    const calm = await RiskEngine.calculateFarmRisk(baseCtx());
    const storm = await RiskEngine.calculateFarmRisk(baseCtx({
      farm: { exposure: 'EXPOSED', anchoringMethod: 'SAND_BAGS', species },
      environment: { ...baseCtx().environment, waveHeightM: 2.2, windSpeedKmh: 40, currentVelocityMs: 0.8, rainfallMm: 15 },
    }));
    expect(storm.risks.STORM_LINE_DAMAGE.probability).toBeGreaterThan(calm.risks.STORM_LINE_DAMAGE.probability + 0.4);
    expect(['HIGH', 'CRITICAL']).toContain(storm.risks.STORM_LINE_DAMAGE.level);
  });

  test('missing environment and observation lowers confidence and flags insufficient data', async () => {
    const r = await RiskEngine.calculateFarmRisk(baseCtx({ environment: null, recentObservation: null, cycle: null, cropAgeDays: null, history: { pastCycles: 0 } }));
    expect(r.risks.HEAT_ICE_ICE.confidence).toBeLessThan(0.4);
    expect(r.risks.HEAT_ICE_ICE.insufficientData).toBe(true);
    expect(r.risks.HEAT_ICE_ICE.missing).toEqual(expect.arrayContaining(['sstC', 'sstAnomalyC']));
  });

  test('HYBRID mode blends an ML probability when a model is available, otherwise stays RULE', async () => {
    const fakeMl = { predict: async (rt) => (rt === 'HEAT_ICE_ICE' ? { probability: 0.9, modelId: 'm1', version: 'v1', syntheticData: true } : null) };
    const r = await RiskEngine.calculateFarmRisk(baseCtx(), { aiMode: 'HYBRID', blendWeight: 0.5, ml: fakeMl });
    const heat = r.risks.HEAT_ICE_ICE;
    expect(heat.modelType).toBe('HYBRID');
    expect(heat.probability).toBeCloseTo(0.5 * heat.ruleProbability + 0.45, 3);
    expect(r.risks.STORM_LINE_DAMAGE.modelType).toBe('RULE');
    expect(r.modelStatus.label).toMatch(/synthetic/);
    const ruleOnly = await RiskEngine.calculateFarmRisk(baseCtx(), { aiMode: 'RULE_ONLY', ml: fakeMl });
    expect(ruleOnly.risks.HEAT_ICE_ICE.modelType).toBe('RULE');
  });

  test('harvest window risk increases when crop is mature and rain is expected', async () => {
    const young = await RiskEngine.calculateFarmRisk(baseCtx({ cropAgeDays: 10 }));
    const mature = await RiskEngine.calculateFarmRisk(baseCtx({ cropAgeDays: 50, environment: { ...baseCtx().environment, rainfallMm: 30, humidityPct: 92 } }));
    expect(mature.risks.HARVEST_WINDOW.probability).toBeGreaterThan(young.risks.HARVEST_WINDOW.probability);
    expect(mature.features.heatProbability).toBeDefined();
  });

  test('crop age is derived, and features are deterministic', () => {
    const f1 = buildFeatures(baseCtx());
    const f2 = buildFeatures(baseCtx());
    expect(f1).toEqual(f2);
    expect(f1.maturityRatio).toBeCloseTo(39 / 45, 3);
    const e = RiskRuleEngine.evaluate('HEAT_ICE_ICE', f1);
    expect(e.probability).toBeGreaterThan(0);
    expect(e.probability).toBeLessThan(1);
  });
});
