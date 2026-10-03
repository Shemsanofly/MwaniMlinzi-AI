import prisma from '../config/prisma.js';
import { RISK_TYPES } from '../ai/constants.js';
import { loadFieldRecords } from '../ai/fieldTrainingData.js';
import { EnvironmentService } from './environmentService.js';
import { RiskService } from './riskService.js';
import { farmYieldHistory, HARVEST_METHOD, MIN_HARVEST_CYCLES } from './harvestForecastService.js';
import { getAllSettings } from './settingsService.js';
import { getLLMProvider } from './assistantService.js';

export const FarmIntelligenceService = {
  async status(farmId) {
    const [settings, environment, risk, history, outcomes, observationCount, harvestCount, forecast] = await Promise.all([
      getAllSettings(), EnvironmentService.latestForFarm(farmId), RiskService.latestForFarm(farmId), farmYieldHistory(farmId),
      loadFieldRecords(prisma), prisma.farmObservation.count({ where: { farmId, channel: { not: 'SEED' } } }),
      prisma.harvestRecord.count({ where: { farmId, channel: { not: 'SEED' } } }),
      prisma.harvestForecast.findFirst({ where: { farmId, isCurrent: true, method: HARVEST_METHOD } }),
    ]);
    const maxAgeHours = Number(settings['environment.maxCacheAgeHours']) || 48;
    const ageHours = environment ? Math.max(0, (Date.now() - +new Date(environment.observedAt)) / 3600000) : null;
    const minimum = Number(settings['ai.minTrainingRecords']) || 300;
    return {
      farmId, checkedAt: new Date().toISOString(),
      assessment: { mode: risk.modelStatus.mode, calculatedAt: risk.calculatedAt,
        available: risk.predictions.some((p) => !p.insufficientData),
        missingInputs: [...new Set(risk.predictions.flatMap((p) => p.missingInputs))],
        measuredAccuracy: null },
      environment: { status: !environment ? 'UNAVAILABLE' : ageHours > maxAgeHours ? 'EXPIRED' : 'CACHED',
        observedAt: environment?.observedAt || null, ageHours, maxAgeHours,
        weather: environment?.weather ? { ...environment.weather, source: environment.weatherSource } : null,
        ocean: environment?.ocean ? { ...environment.ocean, source: environment.oceanSource } : null,
        dataKind: 'External weather and ocean forecasts; not on-farm sensor measurements.' },
      records: { observations: observationCount, harvests: harvestCount },
      harvest: { available: !!forecast, completedCycles: history.harvestCount, minimumCycles: MIN_HARVEST_CYCLES,
        method: forecast?.method || null, measuredAccuracy: null },
      training: RISK_TYPES.map((riskType) => {
        const records = outcomes.filter((r) => r.labels[riskType] != null);
        const positives = records.filter((r) => r.labels[riskType] === 1).length;
        return { riskType, records: records.length, positives, negatives: records.length - positives,
          minimumRecords: minimum, minimumPerClass: 20,
          ready: records.length >= minimum && positives >= 20 && records.length - positives >= 20 };
      }),
      assistant: { responseSource: 'FARM_RECORDS', languageModelConfigured: !!getLLMProvider().isLive },
    };
  },
};
