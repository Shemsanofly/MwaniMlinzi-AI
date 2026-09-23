/**
 * Feature vector used by the ML models (training + inference share this file,
 * so there is a single definition of preprocessing).
 */
export const ML_FEATURES = [
  'sstC', 'sstAnomalyC', 'sstAnomalyDays', 'sstTrend7d',
  'waveHeightM', 'windSpeedKmh', 'currentVelocityMs', 'rainfallMm', 'salinityPsu', 'chlorophyllMgM3', 'humidityPct',
  'cropAgeDays', 'maturityRatio', 'heatSensitivity',
  'exposureScore', 'anchorWeakness',
  'hasRecentObservation', 'obsWhitening', 'obsBreakage', 'obsEpiphytes', 'obsDisease', 'obsPoorCondition',
  'obsSlowGrowth', 'obsLooseGear', 'obsTurbidWater', 'obsPercentAffected',
  'histIceIceLossRate', 'histStormLossRate', 'histYieldRatio',
];

/** Neutral imputation values for missing inputs (documented in docs/AI.md). */
export const IMPUTE = {
  sstC: 27.5, sstAnomalyC: 0, sstAnomalyDays: 0, sstTrend7d: 0,
  waveHeightM: 0.7, windSpeedKmh: 15, currentVelocityMs: 0.3, rainfallMm: 2, salinityPsu: 34, chlorophyllMgM3: 0.3, humidityPct: 75,
  cropAgeDays: 25, maturityRatio: 0.5, heatSensitivity: 0.5, exposureScore: 0.5, anchorWeakness: 0.6,
  hasRecentObservation: 0, obsWhitening: 0, obsBreakage: 0, obsEpiphytes: 0, obsDisease: 0, obsPoorCondition: 0,
  obsSlowGrowth: 0, obsLooseGear: 0, obsTurbidWater: 0, obsPercentAffected: 0,
  histIceIceLossRate: 0, histStormLossRate: 0, histYieldRatio: 1,
};

export function toVector(features, featureNames = ML_FEATURES) {
  return featureNames.map((name) => {
    const v = features?.[name];
    return v === null || v === undefined || !Number.isFinite(Number(v)) ? IMPUTE[name] ?? 0 : Number(v);
  });
}
