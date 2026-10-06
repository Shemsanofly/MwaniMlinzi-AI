import { jest } from '@jest/globals';
import { hasFieldEvidence, validProbability } from '../../src/server/ai/modelEvidence.js';
import { loadFieldRecords } from '../../src/server/ai/fieldTrainingData.js';
import { routeQuestion, getLLMProvider, setLLMProvider } from '../../src/server/services/assistantService.js';
import { serializePrediction, pickNextAction } from '../../src/server/services/riskService.js';
import { forecastForCycle } from '../../src/server/services/harvestForecastService.js';
import { OpenMeteoMarineProvider } from '../../src/server/providers/oceanProvider.js';
import { buildFeatures } from '../../src/server/ai/features.js';
import { observationSchema } from '../../src/server/validators/schemas.js';

describe('real-data prediction boundaries', () => {
  test('unanswered optional symptoms and inspections stay unknown; explicit no stays zero', () => {
    const report = observationSchema.parse({ cropCondition: 'GOOD', whitening: false, breakage: false, unusualGrowth: false });
    expect(report.epiphytes).toBeNull();
    expect(report.diseaseSymptoms).toBeNull();
    const features = buildFeatures({ recentObservation: report });
    expect(features.obsEpiphytes).toBeNull();
    expect(features.obsDisease).toBeNull();
    expect(features.obsTurbidWater).toBeNull();
    expect(features.obsLooseGear).toBeNull();
    expect(buildFeatures({ recentObservation: { ...report, epiphytes: false, diseaseSymptoms: false, waterAppearance: 'CLEAR', lineCondition: 'GOOD' } }))
      .toMatchObject({ obsEpiphytes: 0, obsDisease: 0, obsTurbidWater: 0, obsLooseGear: 0 });
  });
  test('production models require explicit field provenance and held-out records', () => {
    const evidence = { syntheticData: false, dataset: 'field-outcomes', trainingRecords: 240, testRecords: 60 };
    expect(hasFieldEvidence(evidence)).toBe(true);
    for (const missing of ['syntheticData', 'dataset', 'trainingRecords', 'testRecords']) {
      const copy = { ...evidence }; delete copy[missing]; expect(hasFieldEvidence(copy)).toBe(false);
    }
    expect(hasFieldEvidence({ ...evidence, syntheticData: true })).toBe(false);
    expect(hasFieldEvidence({ ...evidence, testRecords: 0 })).toBe(false);
    for (const value of [-0.1, 1.1, NaN, Infinity, '0.5']) expect(validProbability(value)).toBe(false);
  });

  test('duplicate outcome reports do not inflate training counts; contradictory labels are excluded', async () => {
    const row = (id, predictionId, label) => ({ id, farmId: 'farm', riskMaterialized: label,
      prediction: { id: predictionId, farmId: 'farm', riskType: 'HEAT_ICE_ICE', features: { sstC: 28 } } });
    const db = { farmRecord: { findMany: jest.fn(async () => [row('1', 'a', true), row('2', 'a', true), row('3', 'b', true), row('4', 'b', false)]) } };
    const records = await loadFieldRecords(db);
    expect(records).toHaveLength(1);
    expect(records[0].labels.HEAT_ICE_ICE).toBe(1);
    expect(db.farmRecord.findMany.mock.calls[0][0].where).toMatchObject({ recordType: 'OUTCOME', prediction: { isSimulation: false, flagged: false, trigger: { not: 'SEED' } } });
  });

  test('expired or flagged assessments cannot drive current next actions', () => {
    const prediction = { id: 'p', createdAt: new Date(Date.now() - 73 * 3600000), forecastHorizonHours: 72,
      modelType: 'RULE', features: {}, factors: [], recommendations: [{ actionLibrary: { id: 'a', urgency: 'URGENT' } }] };
    const p = serializePrediction(prediction);
    expect(p.stale).toBe(true);
    expect(p.insufficientData).toBe(true);
    expect(pickNextAction([p])).toBeNull();
  });

  test('overdue planned harvest dates stay unchanged and no grade is fabricated', () => {
    const date = new Date('2025-01-01');
    const fc = forecastForCycle({ cycle: { linesPlanted: 100, plantingDate: new Date('2024-12-01'), expectedHarvestDate: date },
      history: { harvestCount: 3, yieldPerLine: 1, lowYieldPerLine: 0.8, highYieldPerLine: 1.2 } });
    expect(fc.expectedHarvestDate).toBe(date);
    expect(fc.inputs.overdue).toBe(true);
    expect(fc.expectedGrade).toBeNull();
  });

  test('live marine data retains API timestamp and has no assumed temperature anomaly', async () => {
    const previous = global.fetch;
    try {
      global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ current: { time: 1790960400, sea_surface_temperature: 28.2, wave_height: 0.6 }, daily: { wave_height_max: [0.8, 1.2] } }) }));
      const reading = await new OpenMeteoMarineProvider().fetch({ latitude: -6.2, longitude: 39.5 });
      expect(+reading.observedAt).toBe(1790960400000);
      expect(reading.sstAnomalyC).toBeNull();
      expect(reading.waveHeightM).toBe(1.2);
    } finally { global.fetch = previous; }
  });

  test('language-model prose and unsupported intents cannot become farm facts', async () => {
    const previous = getLLMProvider();
    try {
      setLLMProvider({ isLive: true, name: 'test', generate: async () => 'Your yield will be 9000 kg. Guaranteed.' });
      expect(await routeQuestion('Tell me something unexpected')).toEqual({ intent: 'UNKNOWN', intentDetectedBy: 'KEYWORDS' });
      setLLMProvider({ isLive: true, name: 'test', generate: async () => '{"intent":"INVENT_FACTS"}' });
      expect((await routeQuestion('Tell me something unexpected')).intent).toBe('UNKNOWN');
      setLLMProvider({ isLive: true, name: 'test', generate: async () => '{"intent":"HARVEST"}' });
      expect((await routeQuestion('How much can I collect?')).intent).toBe('HARVEST');
    } finally { setLLMProvider(previous); }
  });
});
