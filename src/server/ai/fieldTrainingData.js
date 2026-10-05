import { farmRecords } from '../db/records.js';
import { ML_FEATURES } from './ml/featureVector.js';

/** One unambiguous field label per prediction; simulations and seeded data never train live models. */
export async function loadFieldRecords(db) {
  const rows = await farmRecords(db, 'OUTCOME').findMany({
    where: { riskMaterialized: { not: null }, prediction: { isSimulation: false, flagged: false, trigger: { not: 'SEED' } } },
    include: { prediction: { select: { id: true, farmId: true, riskType: true, features: true } } },
    orderBy: { outcomeDate: 'asc' },
  });
  const byPrediction = new Map();
  for (const row of rows) {
    const p = row.prediction;
    const features = p?.features;
    if (!p || p.farmId !== row.farmId || !features || features.__insufficientData
      || !ML_FEATURES.every((key) => features[key] == null || (typeof features[key] === 'number' && Number.isFinite(features[key])))
      || !ML_FEATURES.some((key) => typeof features[key] === 'number')) continue;
    const existing = byPrediction.get(p.id);
    const label = row.riskMaterialized ? 1 : 0;
    if (existing) { existing.conflict ||= existing.label !== label; continue; }
    byPrediction.set(p.id, { id: `FIELD-${row.id}`, features, labels: { [p.riskType]: label }, label, conflict: false });
  }
  return [...byPrediction.values()].filter((record) => !record.conflict);
}
