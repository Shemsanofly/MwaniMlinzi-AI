#!/usr/bin/env node
/**
 * Generates a SYNTHETIC seaweed-risk dataset for demo ML training.
 *
 *   node ai/scripts/generateDataset.js [--n 1500] [--seed 42]
 *   (or from backend/: npm run ai:dataset)
 *
 * The records come from a hand-written latent process (heat stress, storm stress, growth stress)
 * with interactions and noise. It is deliberately DIFFERENT from the rule engine so the ML model
 * is not a copy of the rules — but it is still invented data: every record carries
 * `synthetic_demo_data: true` and must never be presented as field data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ML_FEATURES } from '../../backend/src/ai/ml/featureVector.js';
import { ZANZIBAR_SST_CLIMATOLOGY } from '../../backend/src/providers/climatology.js';
import { mulberry32 } from '../../backend/src/providers/demoRandom.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const N = Math.min(Math.max(Number(arg('n', 1500)), 500), 20000);
const SEED = Number(arg('seed', 42));
const rand = mulberry32(SEED);

const U = (a, b) => a + (b - a) * rand();
const normal = (mu = 0, sd = 1) => {
  const u = 1 - rand(); const v = rand();
  return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const bern = (p) => (rand() < p ? 1 : 0);
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r2 = (v) => Math.round(v * 100) / 100;

const SPECIES = [
  { code: 'KAPPA', heatSensitivity: 0.75, cycle: 45, optMin: 25, optMax: 29, yieldPerLine: 1.3, share: 0.6 },
  { code: 'EUCH', heatSensitivity: 0.45, cycle: 42, optMin: 24, optMax: 30, yieldPerLine: 1.0, share: 0.4 },
];

function record(i) {
  const month = Math.floor(rand() * 12);
  const sp = rand() < SPECIES[0].share ? SPECIES[0] : SPECIES[1];
  const heatwave = rand() < 0.3;
  const sstAnomalyC = heatwave ? normal(1.2, 0.5) : normal(0.15, 0.4);
  const sstAnomalyDays = sstAnomalyC > 0.5 ? Math.floor(U(1, 13)) : 0;
  const sstC = ZANZIBAR_SST_CLIMATOLOGY[month] + sstAnomalyC;
  const sstTrend7d = normal(0.1 * sstAnomalyC, 0.3);
  const stormy = rand() < 0.2;
  const waveHeightM = clamp(stormy ? U(1.3, 3) : Math.exp(normal(Math.log(0.6), 0.35)), 0.1, 4);
  const windSpeedKmh = clamp(10 + 12 * waveHeightM + normal(0, 5), 2, 90);
  const currentVelocityMs = clamp(0.15 + 0.2 * waveHeightM + normal(0, 0.1), 0.02, 2);
  const rainfallMm = clamp(stormy ? U(5, 35) : -Math.log(1 - rand()) * 2, 0, 80);
  const salinityPsu = clamp(34.5 - 0.09 * rainfallMm + normal(0, 0.6), 26, 36.5);
  const chlorophyllMgM3 = clamp(Math.exp(normal(Math.log(0.3), 0.45)), 0.03, 3);
  const humidityPct = clamp(70 + 0.8 * rainfallMm + normal(0, 5), 45, 100);
  const cropAgeDays = Math.floor(U(1, 60));
  const maturityRatio = cropAgeDays / sp.cycle;
  const exposureScore = [0, 0.5, 0.5, 1][Math.floor(rand() * 4)];
  const anchorWeakness = [0.2, 0.5, 0.6, 0.6, 0.8][Math.floor(rand() * 5)];
  const histIceIceLossRate = rand() < 0.6 ? 0 : r2(U(0, 0.7));
  const histStormLossRate = rand() < 0.7 ? 0 : r2(U(0, 0.6));
  const histYieldRatio = rand() < 0.25 ? null : r2(clamp(normal(0.92, 0.15), 0.3, 1.3));
  const looseGearLatent = bern(0.15);
  const epiphyteLatent = bern(0.2);

  // Latent stresses → events in the next 72 h (heat, storm) / this cycle (growth, harvest value).
  const H = 0.9 * Math.max(0, sstAnomalyC) * (1 + 0.08 * Math.min(sstAnomalyDays, 10))
    + 0.6 * Math.max(0, sstC - sp.optMax) + 0.5 * sp.heatSensitivity
    + (cropAgeDays >= 20 && cropAgeDays <= 50 ? 0.4 : 0) + 0.8 * histIceIceLossRate
    + (waveHeightM < 0.4 ? 0.3 * Math.max(0, sstAnomalyC) : 0) + normal(0, 0.45);
  const heat = bern(sigmoid(2.2 * (H - 1.9)));

  const S = 1.4 * Math.max(0, waveHeightM - 1.0) + 0.04 * Math.max(0, windSpeedKmh - 25) + 1.0 * Math.max(0, currentVelocityMs - 0.5)
    + 0.9 * exposureScore + 0.7 * anchorWeakness + 0.8 * histStormLossRate + 0.8 * looseGearLatent + normal(0, 0.4);
  const storm = bern(sigmoid(2 * (S - 2.0)));

  const G = 0.5 * Math.max(0, sp.optMin - sstC, sstC - sp.optMax) + 0.4 * Math.max(0, 31 - salinityPsu) + (chlorophyllMgM3 < 0.2 ? 0.7 : 0)
    + 0.9 * epiphyteLatent + 0.8 * (1 - (histYieldRatio ?? 1)) + normal(0, 0.4);
  const poorGrowth = bern(sigmoid(2 * (G - 1.2)));

  const HV = maturityRatio >= 0.8
    ? 1.5 * Math.max(0, maturityRatio - 1.0) + 0.05 * rainfallMm + (humidityPct > 85 ? 0.4 : 0) + 1.0 * heat + 0.8 * storm + normal(0, 0.35)
    : -1;
  const harvestLoss = maturityRatio >= 0.8 ? bern(sigmoid(2 * (HV - 1.2))) : bern(0.03);

  // Farmer observations are noisy signals of the latent state (not every farm reports).
  const hasObs = bern(0.7);
  const whitening = hasObs ? bern(heat ? 0.65 : 0.07) : null;
  const disease = hasObs ? bern(heat ? 0.4 : 0.05) : null;
  const slow = hasObs ? bern(poorGrowth ? 0.6 : 0.1) : null;
  const features = {
    sstC: r2(sstC), sstAnomalyC: r2(sstAnomalyC), sstAnomalyDays, sstTrend7d: r2(sstTrend7d),
    waveHeightM: r2(waveHeightM), windSpeedKmh: r2(windSpeedKmh), currentVelocityMs: r2(currentVelocityMs), rainfallMm: r2(rainfallMm),
    salinityPsu: r2(salinityPsu), chlorophyllMgM3: r2(chlorophyllMgM3), humidityPct: r2(humidityPct),
    cropAgeDays, maturityRatio: r2(maturityRatio), heatSensitivity: sp.heatSensitivity, exposureScore, anchorWeakness,
    hasRecentObservation: hasObs,
    obsWhitening: whitening, obsBreakage: hasObs ? bern(storm ? 0.5 : 0.05) : null, obsEpiphytes: hasObs ? bern(epiphyteLatent ? 0.8 : 0.05) : null,
    obsDisease: disease, obsPoorCondition: hasObs ? (heat || poorGrowth ? [0.5, 1][bern(0.5)] : [0, 0, 0.5][Math.floor(rand() * 3)]) : null,
    obsSlowGrowth: slow, obsLooseGear: hasObs ? (looseGearLatent ? bern(0.8) : bern(0.03)) : null, obsTurbidWater: hasObs ? bern(rainfallMm > 10 ? 0.5 : 0.1) : null,
    obsPercentAffected: hasObs ? (heat ? r2(U(5, 40)) : whitening ? r2(U(1, 10)) : 0) : null,
    histIceIceLossRate, histStormLossRate, histYieldRatio,
  };
  const yieldKgDryPerLine = r2(sp.yieldPerLine * (poorGrowth ? U(0.55, 0.8) : U(0.85, 1.1)) * (1 - 0.35 * heat - 0.3 * storm));
  return {
    id: `SYN-${String(i + 1).padStart(5, '0')}`,
    synthetic_demo_data: true,
    species: sp.code,
    month: month + 1,
    features,
    labels: { HEAT_ICE_ICE: heat, STORM_LINE_DAMAGE: storm, POOR_GROWTH: poorGrowth, HARVEST_WINDOW: harvestLoss },
    harvestOutcome: { yieldKgDryPerLine, lossEvent: heat || storm ? 1 : 0 },
  };
}

const records = Array.from({ length: N }, (_, i) => record(i));
const positives = Object.fromEntries(['HEAT_ICE_ICE', 'STORM_LINE_DAMAGE', 'POOR_GROWTH', 'HARVEST_WINDOW'].map((k) => [k, records.filter((r) => r.labels[k] === 1).length]));
const out = {
  meta: {
    name: 'mwanimlinzi-synthetic-v1',
    generatedAt: new Date().toISOString(),
    records: N,
    seed: SEED,
    synthetic_demo_data: true,
    positives,
    featureNames: ML_FEATURES,
    note: 'SYNTHETIC DEMO DATA generated from an invented latent process. Not field data. Do not report metrics from this data as real-world accuracy.',
  },
  records,
};
const dir = path.resolve(here, '..', 'datasets');
fs.mkdirSync(dir, { recursive: true });
const jsonPath = path.join(dir, 'synthetic_seaweed_dataset.json');
fs.writeFileSync(jsonPath, JSON.stringify(out));
const header = ['id', 'synthetic_demo_data', 'species', 'month', ...ML_FEATURES, 'label_heat_ice_ice', 'label_storm_line_damage', 'label_poor_growth', 'label_harvest_loss', 'yield_kg_dry_per_line'];
const csv = [header.join(','), ...records.map((r) => [r.id, true, r.species, r.month, ...ML_FEATURES.map((f) => r.features[f] ?? ''), r.labels.HEAT_ICE_ICE, r.labels.STORM_LINE_DAMAGE, r.labels.POOR_GROWTH, r.labels.HARVEST_WINDOW, r.harvestOutcome.yieldKgDryPerLine].join(','))].join('\n');
fs.writeFileSync(path.join(dir, 'synthetic_seaweed_dataset.csv'), csv);
console.log(`[dataset] wrote ${N} SYNTHETIC records → ${path.relative(process.cwd(), jsonPath)} (+ .csv)`);
console.log('[dataset] positive labels:', positives);
