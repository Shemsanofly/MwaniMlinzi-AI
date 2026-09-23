import prisma from '../config/prisma.js';
import { badRequest, notFound } from '../utils/errors.js';
import { levelRank } from '../ai/constants.js';
import { activeCycle } from './farmContextService.js';
import { RiskService } from './riskService.js';
import { HarvestForecastService } from './harvestForecastService.js';

const round = (v, dp = 2) => (v == null ? null : Math.round(v * 10 ** dp) / 10 ** dp);

/** Harvest arithmetic: difference and loss % versus the estimate. */
export function harvestMetrics({ estimatedQuantity, actualQuantity, pricePerKg }) {
  const difference = estimatedQuantity != null ? actualQuantity - estimatedQuantity : null;
  const lossPercent = estimatedQuantity ? Math.max(0, ((estimatedQuantity - actualQuantity) / estimatedQuantity) * 100) : null;
  return {
    differenceQuantity: round(difference),
    lossPercent: round(lossPercent, 1),
    totalValue: pricePerKg != null ? round(actualQuantity * pricePerKg, 0) : null,
  };
}

/**
 * Feedback-loop labelling: compare what was predicted with what happened.
 * HIGH/CRITICAL + risk happened → CORRECT; HIGH/CRITICAL + nothing happened → FALSE_POSITIVE;
 * LOW/MEDIUM + risk happened → FALSE_NEGATIVE; LOW/MEDIUM + nothing happened → CORRECT.
 */
export function feedbackTypeFor(predictedLevel, riskMaterialized) {
  const predictedHigh = levelRank(predictedLevel) >= levelRank('HIGH');
  if (predictedHigh) return riskMaterialized ? 'CORRECT' : 'FALSE_POSITIVE';
  return riskMaterialized ? 'FALSE_NEGATIVE' : 'CORRECT';
}

export const RecordService = {
  async createObservation(farmId, user, data, { channel = 'APP', runRisk = true } = {}) {
    const cycle = await activeCycle(farmId);
    if (data.imageFileId) {
      const file = await prisma.uploadedFile.findUnique({ where: { id: data.imageFileId } });
      if (!file || file.uploadedById !== user.id) throw badRequest('Image not found or not uploaded by you');
    }
    const observation = await prisma.farmObservation.create({
      data: {
        farmId,
        plantingCycleId: cycle?.id || null,
        reporterId: user?.id || null,
        observedAt: data.observedAt || new Date(),
        cropCondition: data.cropCondition,
        whitening: data.whitening,
        breakage: data.breakage,
        epiphytes: data.epiphytes,
        diseaseSymptoms: data.diseaseSymptoms,
        unusualGrowth: data.unusualGrowth,
        growthCondition: data.growthCondition || (data.unusualGrowth ? 'UNUSUAL' : null),
        waterAppearance: data.waterAppearance || null,
        lineCondition: data.lineCondition || null,
        anchorCondition: data.anchorCondition || null,
        percentAffected: data.percentAffected ?? null,
        notes: data.notes || null,
        confidence: data.confidence || 'MEDIUM',
        channel,
        imageFileId: data.imageFileId || null,
      },
    });
    const diseases = [];
    if (data.whitening || data.diseaseSymptoms) diseases.push({ diseaseType: 'ICE_ICE', severity: (data.percentAffected ?? 0) >= 30 ? 'HIGH' : 'MEDIUM' });
    if (data.epiphytes) diseases.push({ diseaseType: 'EPIPHYTES', severity: 'MEDIUM' });
    if (diseases.length) {
      await prisma.diseaseObservation.createMany({ data: diseases.map((d) => ({ ...d, observationId: observation.id, farmId, percentAffected: data.percentAffected ?? null })) });
    }
    // Every observation immediately re-runs the risk engine so the farmer sees updated risk + advice.
    const risk = runRisk ? await RiskService.runForFarm(farmId, { trigger: 'OBSERVATION' }) : null;
    return { observation, risk };
  },

  async createHarvest(farmId, data) {
    const cycle = await activeCycle(farmId);
    let estimated = data.estimatedQuantity;
    if (estimated == null) {
      const fc = await prisma.harvestForecast.findFirst({ where: { farmId, isCurrent: true } });
      estimated = fc ? fc.riskAdjustedQuantityKg : null;
    }
    if (data.buyerId && !(await prisma.buyer.findUnique({ where: { id: data.buyerId } }))) throw badRequest('Unknown buyer');
    const metrics = harvestMetrics({ estimatedQuantity: estimated, actualQuantity: data.actualQuantity, pricePerKg: data.pricePerKg });
    const harvest = await prisma.$transaction(async (tx) => {
      const h = await tx.harvestRecord.create({
        data: {
          farmId,
          plantingCycleId: cycle?.id || null,
          buyerId: data.buyerId || null,
          harvestDate: data.harvestDate,
          estimatedQuantity: estimated ?? null,
          actualQuantity: data.actualQuantity,
          unit: data.unit,
          qualityGrade: data.qualityGrade || null,
          dryingMethod: data.dryingMethod || null,
          dryingDurationDays: data.dryingDurationDays ?? null,
          pricePerKg: data.pricePerKg ?? null,
          notes: data.notes || null,
          ...metrics,
        },
      });
      if (data.qualityGrade) {
        await tx.qualityRecord.create({ data: { farmId, harvestRecordId: h.id, grade: data.qualityGrade, moisturePercent: data.moisturePercent ?? null, impurityPercent: data.impurityPercent ?? null } });
      }
      if (data.dryingMethod) {
        await tx.dryingRecord.create({
          data: { farmId, harvestRecordId: h.id, method: data.dryingMethod, startDate: data.harvestDate, durationDays: data.dryingDurationDays ?? null, groundContact: data.groundContact ?? data.dryingMethod === 'GROUND', rainDuringDrying: data.rainDuringDrying ?? false },
        });
      }
      if (cycle && data.closeCycle) {
        await tx.plantingCycle.update({ where: { id: cycle.id }, data: { status: 'HARVESTED' } });
        await tx.harvestForecast.updateMany({ where: { farmId, isCurrent: true }, data: { isCurrent: false } });
      }
      return h;
    });
    return prisma.harvestRecord.findUnique({ where: { id: harvest.id }, include: { quality: true, drying: true, buyer: { select: { id: true, companyName: true } } } });
  },

  async createLoss(farmId, data) {
    const cycle = await activeCycle(farmId);
    const loss = await prisma.lossRecord.create({
      data: { farmId, plantingCycleId: cycle?.id || null, lossDate: data.lossDate, cause: data.cause, quantityKg: data.quantityKg ?? null, percentLost: data.percentLost, notes: data.notes || null },
    });
    if (cycle && data.percentLost >= 90) await prisma.plantingCycle.update({ where: { id: cycle.id }, data: { status: 'FAILED' } });
    await HarvestForecastService.generate({ farmId }).catch(() => null);
    return loss;
  },

  async recordAction(farmId, user, data, { channel = 'APP' } = {}) {
    let rec = null;
    if (data.recommendationId) {
      rec = await prisma.actionRecommendation.findUnique({ where: { id: data.recommendationId }, include: { actionLibrary: true } });
      if (!rec || rec.farmId !== farmId) throw notFound('Recommendation');
    }
    const description = data.description || rec?.actionLibrary.action;
    if (!description) throw badRequest('Describe the action taken or link a recommendation');
    const action = await prisma.farmerAction.create({
      data: { farmId, recommendationId: rec?.id || null, userId: user?.id || null, actionTaken: data.actionTaken, description, performedAt: data.performedAt || new Date(), notes: data.notes || null, channel },
    });
    if (rec) await prisma.actionRecommendation.update({ where: { id: rec.id }, data: { status: data.actionTaken ? 'COMPLETED' : 'DISMISSED' } });
    return action;
  },

  /** Records what happened after a prediction/recommendation — this is the future ML training label. */
  async recordOutcome(farmId, user, data) {
    let predictionId = data.predictionId || null;
    let recommendationId = data.recommendationId || null;
    if (data.farmerActionId) {
      const fa = await prisma.farmerAction.findUnique({ where: { id: data.farmerActionId } });
      if (!fa || fa.farmId !== farmId) throw notFound('Farmer action');
      recommendationId ||= fa.recommendationId;
    }
    if (recommendationId) {
      const rec = await prisma.actionRecommendation.findUnique({ where: { id: recommendationId } });
      if (!rec || rec.farmId !== farmId) throw notFound('Recommendation');
      predictionId ||= rec.predictionId;
    }
    let prediction = null;
    if (predictionId) {
      prediction = await prisma.riskPrediction.findUnique({ where: { id: predictionId } });
      if (!prediction || prediction.farmId !== farmId) throw notFound('Prediction');
    }
    const lossPercent = data.lossPercent ?? { NO_LOSS: 0, TOTAL_LOSS: 100, HARVESTED: 0 }[data.outcomeType] ?? null;
    // Any recorded loss (minor/major/total) counts as the risk having materialised unless the user says otherwise.
    const riskMaterialized = data.riskMaterialized ?? (['MINOR_LOSS', 'MAJOR_LOSS', 'TOTAL_LOSS'].includes(data.outcomeType) || (lossPercent ?? 0) >= 10);
    const outcome = await prisma.actionOutcome.create({
      data: {
        farmId, farmerActionId: data.farmerActionId || null, recommendationId, predictionId,
        outcomeType: data.outcomeType, lossPercent, riskMaterialized, outcomeDate: data.outcomeDate || new Date(), notes: data.notes || null,
      },
    });
    let feedback = null;
    if (prediction && riskMaterialized != null) {
      const mp = await prisma.modelPrediction.findFirst({ where: { riskPredictionId: prediction.id } });
      feedback = await prisma.modelFeedback.create({
        data: { riskPredictionId: prediction.id, modelId: mp?.modelId || null, userId: user?.id || null, feedbackType: feedbackTypeFor(prediction.riskLevel, riskMaterialized), notes: `Auto-labelled from outcome ${outcome.id}` },
      });
    }
    return { outcome, feedback };
  },
};
