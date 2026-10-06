import { cropStageFor, levelRank } from './constants.js';

const URGENCY_RANK = { ROUTINE: 0, SOON: 1, URGENT: 2, IMMEDIATE: 3 };

const OPS = {
  lt: (a, b) => a < b,
  lte: (a, b) => a <= b,
  gt: (a, b) => a > b,
  gte: (a, b) => a >= b,
  eq: (a, b) => a === b,
  neq: (a, b) => a !== b,
};

/** All conditions must hold; a condition on a missing feature fails (conservative). */
export function conditionsHold(conditions, features) {
  if (!conditions) return true;
  const list = Array.isArray(conditions) ? conditions : [];
  return list.every(({ feature, op, value }) => {
    const v = features?.[feature];
    if (v === null || v === undefined || !OPS[op]) return false;
    return OPS[op](v, value);
  });
}

/**
 * ActionEngine — the ONLY component allowed to decide what a farmer is told to do.
 * It selects an entry from the curated Action Library (never free text, never the LLM).
 */
export const ActionEngine = {
  select({ riskType, level, insufficientData }, features, library, { requireValidated = false } = {}) {
    if (insufficientData) return null;
    const stage = cropStageFor(features?.maturityRatio);
    const rank = levelRank(level);
    const candidates = library.filter((a) => a.enabled
      && a.riskType === riskType
      && rank >= levelRank(a.minimumRiskLevel)
      && (a.maximumRiskLevel == null || rank <= levelRank(a.maximumRiskLevel))
      && (a.cropStage === 'ANY' || a.cropStage === stage)
      && (!requireValidated || a.validated)
      && conditionsHold(a.conditions, features));
    candidates.sort((a, b) => levelRank(b.minimumRiskLevel) - levelRank(a.minimumRiskLevel)
      || (b.cropStage !== 'ANY') - (a.cropStage !== 'ANY')
      || (Array.isArray(b.conditions) ? b.conditions.length : 0) - (Array.isArray(a.conditions) ? a.conditions.length : 0)
      || b.priority - a.priority);
    return candidates[0] || null;
  },

  /** Selects one action per risk type and the single most important "next action". */
  selectAll(riskResult, library, opts) {
    const perRisk = {};
    for (const [riskType, risk] of Object.entries(riskResult.risks)) {
      perRisk[riskType] = ActionEngine.select(risk, riskResult.features, library, opts);
    }
    const ranked = Object.entries(perRisk)
      .filter(([, a]) => a)
      .map(([riskType, action]) => ({ riskType, action, risk: riskResult.risks[riskType] }))
      .sort((x, y) => levelRank(y.risk.level) - levelRank(x.risk.level)
        || URGENCY_RANK[y.action.urgency] - URGENCY_RANK[x.action.urgency]
        || y.action.priority - x.action.priority);
    const insufficient = Object.values(riskResult.risks).every((r) => r.insufficientData);
    return { perRisk, next: ranked[0] || null, insufficientData: insufficient };
  },

  INSUFFICIENT_DATA: {
    en: 'Not enough data to give reliable advice. Please record a farm observation so the system can assess your farm.',
    sw: 'Data haitoshi kutoa ushauri wa kuaminika. Tafadhali rekodi hali ya shamba ili mfumo uweze kulitathmini.',
  },
};
