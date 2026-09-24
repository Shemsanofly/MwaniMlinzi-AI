import prisma from '../config/prisma.js';
import { levelRank } from '../ai/constants.js';

/**
 * Model monitoring from REAL outcomes: compares predictions (HIGH/CRITICAL = positive)
 * with recorded outcomes (`risk_materialized`). If no outcomes exist, metrics are reported
 * as unavailable — never estimated.
 */
export const ModelMonitoringService = {
  async fieldConfusion({ modelId = null } = {}) {
    const outcomes = await prisma.actionOutcome.findMany({
      where: { riskMaterialized: { not: null }, predictionId: { not: null }, ...(modelId ? { prediction: { modelPredictions: { some: { modelId } } } } : {}) },
      include: { prediction: { select: { riskLevel: true, riskType: true, isSimulation: true } } },
    });
    const real = outcomes.filter((o) => o.prediction && !o.prediction.isSimulation);
    let tp = 0; let fp = 0; let tn = 0; let fn = 0;
    for (const o of real) {
      const predicted = levelRank(o.prediction.riskLevel) >= levelRank('HIGH');
      if (predicted && o.riskMaterialized) tp += 1;
      else if (predicted) fp += 1;
      else if (o.riskMaterialized) fn += 1;
      else tn += 1;
    }
    const n = real.length;
    const precision = tp + fp ? tp / (tp + fp) : null;
    const recall = tp + fn ? tp / (tp + fn) : null;
    const f1 = precision != null && recall != null && precision + recall ? (2 * precision * recall) / (precision + recall) : null;
    return { outcomes: n, confusionMatrix: { tp, fp, tn, fn }, precision, recall, f1, accuracy: n ? (tp + tn) / n : null, note: n < 30 ? 'Fewer than 30 field outcomes — metrics are not yet statistically meaningful.' : null };
  },

  async computeFieldMetrics() {
    const overall = await this.fieldConfusion();
    const models = await prisma.mlModel.findMany({ where: { status: { in: ['ACTIVE', 'TRAINED'] } } });
    for (const m of models) {
      const c = await this.fieldConfusion({ modelId: m.id });
      if (!c.outcomes) continue;
      for (const metric of ['precision', 'recall', 'f1', 'accuracy']) {
        if (c[metric] == null) continue;
        await prisma.modelMetric.create({ data: { modelId: m.id, dataset: 'FIELD', metric, value: c[metric], details: { confusionMatrix: c.confusionMatrix, outcomes: c.outcomes } } });
      }
    }
    return overall;
  },
};
