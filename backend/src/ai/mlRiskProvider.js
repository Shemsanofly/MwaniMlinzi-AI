import fs from 'node:fs/promises';
import prisma from '../config/prisma.js';
import { predictProba } from './ml/logisticRegression.js';
import { toVector } from './ml/featureVector.js';
import { resolveModelPath } from './paths.js';

/**
 * MLRiskProvider: serves ACTIVE trained models (one per risk type) from `ml_models`.
 * If no model is active, the file is missing or corrupt, it returns null and the
 * RiskEngine falls back to the rule-based baseline. It never fabricates a probability.
 */
const loaded = new Map(); // modelId -> parsed model json
let activeCache = null;
let activeCacheAt = 0;

async function activeModels() {
  if (activeCache && Date.now() - activeCacheAt < 10000) return activeCache;
  const rows = await prisma.mlModel.findMany({ where: { status: 'ACTIVE' } });
  activeCache = Object.fromEntries(rows.map((r) => [r.riskType, r]));
  activeCacheAt = Date.now();
  return activeCache;
}

async function loadModel(row) {
  if (loaded.has(row.id)) return loaded.get(row.id);
  const raw = await fs.readFile(resolveModelPath(row.filePath), 'utf8');
  const json = JSON.parse(raw);
  if (!Array.isArray(json.weights) || !Array.isArray(json.featureNames) || json.weights.length !== json.featureNames.length) {
    throw new Error('Model file is invalid');
  }
  loaded.set(row.id, json);
  return json;
}

export const MLRiskProvider = {
  clearCache() {
    activeCache = null;
    loaded.clear();
  },

  async status() {
    const models = await activeModels();
    return Object.fromEntries(Object.entries(models).map(([k, m]) => [k, { id: m.id, version: m.version, syntheticData: m.syntheticData, trainedAt: m.trainedAt }]));
  },

  /** @returns {Promise<null | {probability:number, modelId:string, version:string, syntheticData:boolean}>} */
  async predict(riskType, features) {
    try {
      const models = await activeModels();
      const row = models[riskType];
      if (!row) return null;
      const model = await loadModel(row);
      const probability = predictProba(model, toVector(features, model.featureNames));
      if (!Number.isFinite(probability)) return null;
      return { probability, modelId: row.id, version: row.version, syntheticData: row.syntheticData };
    } catch (err) {
      console.warn(`[ml] model unavailable for ${riskType}: ${err.message} — using rule baseline`);
      return null;
    }
  },
};
