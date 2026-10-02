import { env } from '../config/env.js';
import { hasFieldEvidence, validProbability } from './modelEvidence.js';

/**
 * RemoteMLProvider — calls the optional Python ML microservice (LightGBM/XGBoost) at
 * `ML_SERVICE_URL`. Returns null on ANY error (service down, timeout, 404 no-model-for-this-risk,
 * malformed response); the caller then falls back to the local JS logistic baseline, which in turn
 * falls back to the rule-based engine. The service is optional — the system is never dependent on it.
 */
export const RemoteMLProvider = {
  isConfigured() {
    return !!env.mlService?.url;
  },

  async health() {
    if (!this.isConfigured()) return { configured: false };
    try {
      const res = await fetch(`${env.mlService.url}/health`, { signal: AbortSignal.timeout(env.mlService.timeoutMs) });
      if (!res.ok) return { configured: true, reachable: false, status: res.status };
      const body = await res.json();
      return { configured: true, reachable: true, ...body };
    } catch (err) {
      return { configured: true, reachable: false, error: err.message };
    }
  },

  /** @returns {Promise<null | {probability:number, modelVersion:string, framework:string}>} */
  async predict(riskType, features) {
    if (!this.isConfigured()) return null;
    try {
      const res = await fetch(`${env.mlService.url}/predict`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ riskType, features }),
        signal: AbortSignal.timeout(env.mlService.timeoutMs),
      });
      if (res.status === 404) return null; // no model for this risk type → fall back to JS baseline
      if (!res.ok) {
        console.warn(`[ml-remote] ${riskType} returned ${res.status}; using JS baseline`);
        return null;
      }
      const body = await res.json();
      if (!validProbability(body.probability) || !hasFieldEvidence(body)
        || body.riskType !== riskType || !body.modelVersion || !body.framework) return null;
      return { probability: body.probability, modelVersion: body.modelVersion, framework: body.framework,
        syntheticData: body.syntheticData, dataset: body.dataset, trainingRecords: body.trainingRecords, testRecords: body.testRecords };
    } catch (err) {
      console.warn(`[ml-remote] ${riskType} unreachable: ${err.message} — using JS baseline`);
      return null;
    }
  },
};
