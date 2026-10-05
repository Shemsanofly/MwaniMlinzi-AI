import fs from 'node:fs/promises';
import prisma from '../config/prisma.js';
import { predictProba } from './ml/logisticRegression.js';
import { toVector } from './ml/featureVector.js';
import { resolveModelPath } from './paths.js';
import { RemoteMLProvider } from './remoteMlProvider.js';
import { hasFieldEvidence } from './modelEvidence.js';

/**
 * MLRiskProvider: serves ACTIVE trained models (one per risk type).
 *
 * Lookup order (first non-null wins; everything is a soft fallback, never a hard dependency):
 *   1. Remote ML service (LightGBM / XGBoost) at ML_SERVICE_URL  — deck slide 7 "LightGBM or XGBoost"
 *   2. Local JS logistic baseline from `ml_models`                — in-process, always available
 *   3. null → RiskEngine uses the rule-based engine                — the always-on baseline
 *
 * It never fabricates a probability: every network error, missing model or malformed file
 * drops down one tier, and the UI shows which model actually produced the prediction.
 */
// Process-wide (globalThis): the admin model routes call clearCache(), and the scheduled risk job runs in
// the separate instrumentation-node.js module graph, which must see the same invalidation.
const store = (globalThis.__mwaniMlModelCache ??= { loaded: new Map(), activeCache: null, activeCacheAt: 0 });
const { loaded } = store; // modelId -> parsed model json

async function activeModels() {
  if (store.activeCache && Date.now() - store.activeCacheAt < 10000) return store.activeCache;
  const rows = await prisma.mlModel.findMany({ where: { status: 'ACTIVE', syntheticData: false, testRecords: { gt: 0 }, trainingRecords: { gt: 0 } } });
  store.activeCache = Object.fromEntries(rows.map((r) => [r.riskType, r]));
  store.activeCacheAt = Date.now();
  return store.activeCache;
}

async function loadModel(row) {
  if (loaded.has(row.id)) return loaded.get(row.id);
  const raw = await fs.readFile(resolveModelPath(row.filePath), 'utf8');
  const json = JSON.parse(raw);
  if (!hasFieldEvidence(json) || json.version !== row.version || json.riskType !== row.riskType
    || json.trainingRecords !== row.trainingRecords || json.testRecords !== row.testRecords
    || !Number.isFinite(json.bias) || !Array.isArray(json.weights) || !json.weights.every(Number.isFinite)
    || !Array.isArray(json.featureNames) || json.weights.length !== json.featureNames.length) {
    throw new Error('Model file is invalid');
  }
  loaded.set(row.id, json);
  return json;
}

export const MLRiskProvider = {
  clearCache() {
    store.activeCache = null;
    loaded.clear();
  },

  async status() {
    const models = await activeModels();
    const local = Object.fromEntries(Object.entries(models).map(([k, m]) => [k, { id: m.id, version: m.version, syntheticData: m.syntheticData, trainedAt: m.trainedAt, framework: 'logistic' }]));
    const remote = await RemoteMLProvider.health();
    return { local, remote };
  },

  /** @returns {Promise<null | {probability:number, modelId?:string, version:string, syntheticData:boolean, framework:string}>} */
  async predict(riskType, features) {
    // Tier 1: remote LightGBM/XGBoost service.
    const remote = await RemoteMLProvider.predict(riskType, features);
    if (remote) return { ...remote, version: remote.modelVersion };

    // Tier 2: local JS logistic baseline from `ml_models`.
    try {
      const models = await activeModels();
      const row = models[riskType];
      if (!row) return null;
      const model = await loadModel(row);
      const probability = predictProba(model, toVector(features, model.featureNames));
      if (!Number.isFinite(probability)) return null;
      return { probability, modelId: row.id, version: row.version, syntheticData: row.syntheticData, framework: 'logistic' };
    } catch (err) {
      console.warn(`[ml] model unavailable for ${riskType}: ${err.message} — using rule baseline`);
      return null;
    }
  },
};
