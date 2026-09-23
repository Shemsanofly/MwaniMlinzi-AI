import { ANCHOR_WEAKNESS, EXPOSURE_SCORE } from './constants.js';

/**
 * Flattens a farm context (farm + cycle + environment + observation + history) into the
 * numeric feature set shared by the rule engine, the ML model and the synthetic dataset.
 * Missing values stay `null`; each consumer decides how to treat them.
 */
export function buildFeatures(ctx) {
  const env = ctx.environment || {};
  const obs = ctx.recentObservation || null;
  const hist = ctx.history || {};
  const species = ctx.farm?.species || {};
  const cycleDays = ctx.expectedCycleDays ?? species.typicalCycleDays ?? 45;
  const cropAgeDays = ctx.cropAgeDays ?? null;
  const gearBad = (c) => (c === 'LOOSE' || c === 'BROKEN' || c === 'MISSING' ? 1 : 0);

  return {
    sstC: num(env.seaSurfaceTempC),
    sstAnomalyC: num(env.sstAnomalyC),
    sstAnomalyDays: num(env.sstAnomalyDays),
    sstTrend7d: num(env.sstTrend7d),
    waveHeightM: num(env.waveHeightM),
    windSpeedKmh: num(env.windSpeedKmh),
    currentVelocityMs: num(env.currentVelocityMs),
    rainfallMm: num(env.rainfallMm),
    salinityPsu: num(env.salinityPsu),
    chlorophyllMgM3: num(env.chlorophyllMgM3),
    humidityPct: num(env.humidityPct),

    cropAgeDays,
    expectedCycleDays: cycleDays,
    maturityRatio: cropAgeDays == null ? null : round(cropAgeDays / cycleDays, 3),
    heatSensitivity: num(species.heatSensitivity) ?? 0.5,
    optimalSstMin: num(species.optimalSstMin) ?? 25,
    optimalSstMax: num(species.optimalSstMax) ?? 29,

    exposureScore: EXPOSURE_SCORE[ctx.farm?.exposure] ?? 0.5,
    anchorWeakness: ANCHOR_WEAKNESS[ctx.farm?.anchoringMethod] ?? 0.6,

    hasRecentObservation: obs ? 1 : 0,
    obsWhitening: obs ? (obs.whitening ? 1 : 0) : null,
    obsBreakage: obs ? (obs.breakage ? 1 : 0) : null,
    obsEpiphytes: obs ? (obs.epiphytes ? 1 : 0) : null,
    obsDisease: obs ? (obs.diseaseSymptoms ? 1 : 0) : null,
    obsPoorCondition: obs ? ({ POOR: 1, FAIR: 0.5, GOOD: 0 }[obs.cropCondition] ?? 0) : null,
    obsSlowGrowth: obs ? (obs.growthCondition === 'SLOW' || obs.unusualGrowth ? 1 : 0) : null,
    obsLooseGear: obs ? Math.max(gearBad(obs.lineCondition), gearBad(obs.anchorCondition)) : null,
    obsTurbidWater: obs ? (obs.waterAppearance && obs.waterAppearance !== 'CLEAR' ? 1 : 0) : null,
    obsPercentAffected: obs ? num(obs.percentAffected) ?? 0 : null,

    histIceIceLossRate: num(hist.iceIceLossRate) ?? 0,
    histStormLossRate: num(hist.stormLossRate) ?? 0,
    histYieldRatio: num(hist.yieldRatio),
  };
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const round = (v, dp = 2) => (v == null ? null : Math.round(v * 10 ** dp) / 10 ** dp);
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const sigmoid = (z) => 1 / (1 + Math.exp(-z));
