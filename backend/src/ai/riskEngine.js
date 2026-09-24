import { RISK_TYPES, levelFor } from './constants.js';
import { buildFeatures, clamp, round } from './features.js';
import { RiskRuleEngine } from './riskRuleEngine.js';
import { ExplanationEngine } from './explanationEngine.js';

/**
 * RiskEngine — hybrid AI orchestrator.
 *   1. builds features from the farm context
 *   2. runs the rule-based baseline for each risk type (always available)
 *   3. if AI mode is HYBRID and an ACTIVE ML model exists, blends the ML probability in
 *   4. maps probability → level using thresholds from system_settings
 *   5. attaches confidence, structured factors and explanations
 */
export const RiskEngine = {
  /**
   * @param {object} ctx farm context (see FarmContextService)
   * @param {object} opts { thresholds, aiMode, blendWeight, ml }
   */
  async calculateFarmRisk(ctx, opts = {}) {
    const { thresholds, aiMode = 'HYBRID', blendWeight = 0.4, ml = null } = opts;
    const features = buildFeatures(ctx);
    const risks = {};
    const order = ['HEAT_ICE_ICE', 'STORM_LINE_DAMAGE', 'POOR_GROWTH', 'HARVEST_WINDOW'];

    for (const riskType of order) {
      const f = riskType === 'HARVEST_WINDOW'
        ? { ...features, heatProbability: risks.HEAT_ICE_ICE?.probability, stormProbability: risks.STORM_LINE_DAMAGE?.probability }
        : features;
      const rule = RiskRuleEngine.evaluate(riskType, f);
      let probability = rule.probability;
      let modelType = 'RULE';
      let modelVersion = RiskRuleEngine.version;
      let mlResult = null;

      if (aiMode === 'HYBRID' && ml) {
        mlResult = await ml.predict(riskType, f);
        if (mlResult) {
          const w = clamp(Number(blendWeight) || 0, 0, 1);
          probability = (1 - w) * rule.probability + w * mlResult.probability;
          modelType = 'HYBRID';
          modelVersion = `${RiskRuleEngine.version}+ml-${mlResult.version}`;
        }
      }

      const confidence = computeConfidence(ctx, rule.missing, mlResult, rule.probability);
      const insufficientData = confidence < 0.4;
      probability = round(probability, 4);
      const level = levelFor(probability, thresholds);
      const base = { riskType, probability, level, factors: rule.factors, insufficientData };
      risks[riskType] = {
        ...base,
        confidence,
        ruleProbability: rule.probability,
        mlProbability: mlResult ? round(mlResult.probability, 4) : null,
        mlModelId: mlResult?.modelId || null,
        mlSyntheticData: mlResult?.syntheticData ?? null,
        modelType,
        modelVersion,
        horizonHours: rule.horizonHours,
        missing: rule.missing,
        explanation: ExplanationEngine.explain(base, 'en'),
        explanationSw: ExplanationEngine.explain(base, 'sw'),
      };
    }

    // Cross-risk signals are exposed as features so Action Library conditions can use them.
    features.heatProbability = risks.HEAT_ICE_ICE.probability;
    features.stormProbability = risks.STORM_LINE_DAMAGE.probability;

    const mlUsed = Object.values(risks).find((r) => r.modelType === 'HYBRID');
    return {
      features,
      risks,
      calculatedAt: new Date().toISOString(),
      modelStatus: mlUsed
        ? { mode: 'HYBRID', label: `Hybrid: rule baseline + ML model ${mlUsed.modelVersion.split('+ml-')[1]}${mlUsed.mlSyntheticData ? ' (trained on synthetic data)' : ''}` }
        : { mode: 'RULE', label: 'Rule-based baseline' },
    };
  },

  riskTypes: RISK_TYPES,
};

function computeConfidence(ctx, missing, mlResult, ruleProbability) {
  let c = 0.35;
  const env = ctx.environment;
  if (env) c += 0.2;
  if (env?.source === 'CACHED') c -= 0.05;
  if (ctx.recentObservation) c += ctx.recentObservation.ageDays <= 7 ? 0.15 : 0.05;
  if (ctx.cycle) c += 0.1;
  c += Math.min(0.1, 0.03 * (ctx.history?.pastCycles || 0));
  c -= 0.1 * missing.length;
  if (mlResult && Math.abs(mlResult.probability - ruleProbability) < 0.15) c += 0.05;
  if (mlResult && Math.abs(mlResult.probability - ruleProbability) > 0.35) c -= 0.1; // models disagree
  return round(clamp(c, 0.15, 0.9), 2);
}
