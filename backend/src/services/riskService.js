import prisma from '../config/prisma.js';
import { RiskEngine } from '../ai/riskEngine.js';
import { ActionEngine } from '../ai/actionEngine.js';
import { MLRiskProvider } from '../ai/mlRiskProvider.js';
import { RISK_TYPES, levelRank } from '../ai/constants.js';
import { FarmContextService } from './farmContextService.js';
import { AlertService } from './alertService.js';
import { getAllSettings } from './settingsService.js';
import { simpleReason } from '../ai/simpleReasons.js';
import { HarvestForecastService } from './harvestForecastService.js';

export function serializeAction(a) {
  if (!a) return null;
  return {
    id: a.id,
    code: a.code,
    riskType: a.riskType,
    action: a.action,
    actionSw: a.actionSw,
    explanation: a.explanation,
    explanationSw: a.explanationSw,
    urgency: a.urgency,
    urgencyHours: a.urgencyHours,
    source: a.source,
    validated: a.validated,
    escalateToExtension: a.escalateToExtension,
  };
}

export function serializeRecommendation(r) {
  if (!r) return null;
  return {
    id: r.id,
    farmId: r.farmId,
    predictionId: r.predictionId,
    status: r.status,
    dueBy: r.dueBy,
    reviewStatus: r.reviewStatus,
    reviewNote: r.reviewNote,
    isSimulation: r.isSimulation,
    createdAt: r.createdAt,
    ...(r.actionLibrary ? { riskType: r.actionLibrary.riskType, actionItem: serializeAction(r.actionLibrary) } : {}),
  };
}

export function serializePrediction(p) {
  const stale = Date.now() - new Date(p.createdAt).getTime() > p.forecastHorizonHours * 3600000;
  const legacyAssessment = p.features?.__assessmentPolicy !== 'real-inputs-v2';
  return {
    id: p.id,
    farmId: p.farmId,
    riskType: p.riskType,
    probability: p.probability,
    riskLevel: p.riskLevel,
    confidence: p.confidence,
    forecastHorizonHours: p.forecastHorizonHours,
    modelType: p.modelType,
    modelVersion: p.modelVersion,
    ruleProbability: p.ruleProbability,
    mlProbability: p.mlProbability,
    explanation: legacyAssessment ? 'Refresh this assessment to apply current real-data checks.' : p.explanation,
    explanationSw: legacyAssessment ? 'Sasisha tathmini hii kutumia ukaguzi wa data halisi wa sasa.' : p.explanationSw,
    dataSource: p.dataSource,
    trigger: p.trigger,
    isSimulation: p.isSimulation,
    flagged: p.flagged,
    flagReason: p.flagReason,
    features: p.features,
    insufficientData: !!(p.features?.__insufficientData || stale || p.flagged || p.trigger === 'SEED' || legacyAssessment),
    legacyAssessment,
    stale,
    assessmentKind: p.modelType === 'RULE' ? 'RULE_ESTIMATE' : 'FIELD_MODEL_ESTIMATE',
    scoreMeaning: 'Risk score; not a verified chance of loss. Confidence measures input completeness, not measured accuracy.',
    missingInputs: p.features?.__missing || [],
    createdAt: p.createdAt,
    factors: (legacyAssessment ? [] : p.factors || []).map((f) => { const s = simpleReason(f.code, f.direction, p.features); return { ...f, simpleLabel: s?.en || null, simpleLabelSw: s?.sw || null }; }).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)),
    recommendation: !legacyAssessment && p.recommendations?.[0] ? serializeRecommendation(p.recommendations[0]) : null,
  };
}

const URGENCY_RANK = { ROUTINE: 0, SOON: 1, URGENT: 2, IMMEDIATE: 3 };

/** Picks the single most important next action from a set of predictions with recommendations. */
export function pickNextAction(predictions) {
  const withRec = predictions.filter((p) => !p.insufficientData && !p.flagged && p.recommendation?.actionItem);
  if (!withRec.length) return null;
  withRec.sort((a, b) => levelRank(b.riskLevel) - levelRank(a.riskLevel)
    || URGENCY_RANK[b.recommendation.actionItem.urgency] - URGENCY_RANK[a.recommendation.actionItem.urgency]);
  const top = withRec[0];
  return {
    riskType: top.riskType,
    riskLevel: top.riskLevel,
    recommendation: top.recommendation,
    reasons: top.factors.filter((f) => f.direction === 'INCREASES').slice(0, 3),
  };
}

async function persistRecommendation(tx, farmId, prediction, action, { simulation }) {
  const dueBy = new Date(Date.now() + action.urgencyHours * 3600 * 1000);
  if (simulation) {
    return tx.actionRecommendation.create({ data: { farmId, predictionId: prediction.id, actionLibraryId: action.id, dueBy, isSimulation: true }, include: { actionLibrary: true } });
  }
  const open = await tx.actionRecommendation.findMany({
    where: { farmId, isSimulation: false, status: { in: ['PENDING', 'ACKNOWLEDGED'] }, actionLibrary: { riskType: action.riskType } },
  });
  const same = open.find((r) => r.actionLibraryId === action.id);
  const toSupersede = open.filter((r) => r.id !== same?.id).map((r) => r.id);
  if (toSupersede.length) await tx.actionRecommendation.updateMany({ where: { id: { in: toSupersede } }, data: { status: 'SUPERSEDED' } });
  if (same) {
    // Same advice still applies: keep the existing recommendation (and its due date), link it to the newest prediction.
    return tx.actionRecommendation.update({ where: { id: same.id }, data: { predictionId: prediction.id }, include: { actionLibrary: true } });
  }
  return tx.actionRecommendation.create({ data: { farmId, predictionId: prediction.id, actionLibraryId: action.id, dueBy }, include: { actionLibrary: true } });
}

export const RiskService = {
  /**
   * Full AI loop for one farm: context → features → risk → explanation → action → alerts.
   * @param {object} opts { trigger, overrides (simulation), refreshEnvironment }
   */
  async runForFarm(farmId, { trigger = 'MANUAL', overrides = null, refreshEnvironment = true, forceEnvironment = false, sendSms = true } = {}) {
    const simulation = !!overrides;
    const ctx = await FarmContextService.build(farmId, { refreshEnvironment, overrides, forceEnvironment });
    const settings = await getAllSettings();
    const result = await RiskEngine.calculateFarmRisk(ctx, {
      thresholds: settings['risk.thresholds'],
      aiMode: settings['ai.mode'],
      blendWeight: settings['ai.mlBlendWeight'],
      ml: MLRiskProvider,
    });
    const library = await prisma.actionLibrary.findMany({ where: { enabled: true } });
    const selection = ActionEngine.selectAll(result, library, { requireValidated: !!settings['actions.requireValidated'] });

    const previousRows = await Promise.all(RISK_TYPES.map((rt) => prisma.riskPrediction.findFirst({ where: { farmId, riskType: rt, isSimulation: false, features: { path: ['__assessmentPolicy'], equals: 'real-inputs-v2' } }, orderBy: { createdAt: 'desc' } })));
    const previous = Object.fromEntries(previousRows.filter(Boolean).map((p) => [p.riskType, p]));

    const dataSource = simulation ? 'SIMULATION' : (ctx.environment?.source || 'UNAVAILABLE');
    const saved = await prisma.$transaction(async (tx) => {
      const out = [];
      for (const riskType of RISK_TYPES) {
        const r = result.risks[riskType];
        const prediction = await tx.riskPrediction.create({
          data: {
            farmId,
            plantingCycleId: ctx.cycle?.id || null,
            environmentalObsId: simulation ? null : ctx.environment?.id || null,
            riskType,
            probability: r.probability,
            riskLevel: r.level,
            confidence: r.confidence,
            forecastHorizonHours: r.horizonHours,
            modelType: r.modelType,
            modelVersion: r.modelVersion,
            ruleProbability: r.ruleProbability,
            mlProbability: r.mlProbability,
            features: { ...result.features, __insufficientData: r.insufficientData, __missing: r.missing,
              __assessmentPolicy: 'real-inputs-v2', __environmentObservedAt: ctx.environment?.observedAt?.toISOString?.() || null,
              __providers: { weather: ctx.environment?.weather?.provider || null, ocean: ctx.environment?.ocean?.provider || null } },
            explanation: r.explanation,
            explanationSw: r.explanationSw,
            dataSource,
            trigger: simulation ? 'SIMULATION' : trigger,
            isSimulation: simulation,
            // Factors + ML link are now inline columns on the prediction (previously in sub-tables).
            factors: r.factors.map((f) => ({ code: f.code, label: f.label, labelSw: f.labelSw, value: f.value, contribution: f.contribution, direction: f.direction })),
            mlModelId: r.mlModelId ?? null,
          },
        });
        const action = selection.perRisk[riskType];
        const rec = action ? await persistRecommendation(tx, farmId, prediction, action, { simulation }) : null;
        out.push({ ...prediction, recommendations: rec ? [rec] : [] });
      }
      return out;
    }, { timeout: 20000 });

    const alerts = await AlertService.fromPredictions({
      farm: ctx.farm,
      predictions: saved,
      previous,
      actions: selection.perRisk,
      features: result.features,
      simulation,
      sendSms: sendSms && trigger !== 'SEED',
    });

    const predictions = saved.map(serializePrediction);
    if (!simulation) await HarvestForecastService.generate({ farmId });
    return {
      farmId,
      farmCode: ctx.farm.farmCode,
      farmName: ctx.farm.name,
      isSimulation: simulation,
      cropAgeDays: ctx.cropAgeDays,
      environment: ctx.environment,
      modelStatus: result.modelStatus,
      predictions,
      nextAction: pickNextAction(predictions),
      insufficientData: selection.insufficientData,
      insufficientDataMessage: selection.insufficientData ? ActionEngine.INSUFFICIENT_DATA : null,
      alerts,
      calculatedAt: result.calculatedAt,
    };
  },

  /** Latest stored (non-simulation) prediction per risk type, with its recommendation. */
  async latestForFarm(farmId) {
    const rows = await Promise.all(RISK_TYPES.map((riskType) => prisma.riskPrediction.findFirst({
      where: { farmId, riskType, isSimulation: false },
      orderBy: { createdAt: 'desc' },
      include: {
        recommendations: { where: { isSimulation: false }, include: { actionLibrary: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    })));
    const predictions = rows.filter(Boolean).map(serializePrediction);
    const insufficient = predictions.length > 0 && predictions.every((p) => p.insufficientData);
    return {
      predictions,
      nextAction: pickNextAction(predictions),
      insufficientData: predictions.length === 0 || insufficient,
      insufficientDataMessage: predictions.length === 0 || insufficient ? ActionEngine.INSUFFICIENT_DATA : null,
      modelStatus: modelStatusFromPredictions(predictions),
      calculatedAt: predictions[0]?.createdAt || null,
    };
  },
};

export function modelStatusFromPredictions(predictions) {
  const hybrid = predictions.find((p) => p.modelType === 'HYBRID');
  return hybrid
    ? { mode: 'HYBRID', label: `Hybrid: rule baseline + ML model ${hybrid.modelVersion.split('+ml-')[1] || ''}`.trim() }
    : { mode: 'RULE', label: 'Rule-based baseline' };
}
