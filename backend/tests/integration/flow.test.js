import { api, auth, login, farmByCode } from '../helpers.js';
import prisma from '../../src/config/prisma.js';

afterAll(() => prisma.$disconnect());

/**
 * The core MwaniMlinzi loop, end to end through the REST API:
 * login → farm → environment → risk → explanation → recommendation → observation → risk changes
 * → alert → action → outcome (feedback label) → harvest → forecasts / dashboards.
 */
describe('end-to-end risk → action → outcome flow', () => {
  let farmer; let farm; let before;

  beforeAll(async () => {
    farmer = await login('farmer');
    farm = await farmByCode(farmer, 'FARM001');
  });

  test('farm shows derived crop age and active cycle', async () => {
    const res = await api().get(`/api/farms/${farm.id}`).set(auth(farmer));
    expect(res.status).toBe(200);
    expect(res.body.data.farm.cropAgeDays).toBe(39);
    expect(res.body.data.farm.currentCycle.status).toBe('ACTIVE');
    expect(res.body.data.farm.isDemo).toBe(true);
  });

  test('environment is labelled with its source', async () => {
    const res = await api().get(`/api/environment/current?farmId=${farm.id}`).set(auth(farmer));
    expect(res.status).toBe(200);
    expect(res.body.data.current.source).toBe('DEMO');
    expect(res.body.data.current.sstAnomalyC).toBeGreaterThan(1);
  });

  test('risk has probability, level, confidence, factors and an approved recommendation', async () => {
    const res = await api().get(`/api/farms/${farm.id}/risks`).set(auth(farmer));
    expect(res.status).toBe(200);
    before = res.body.data.predictions.find((p) => p.riskType === 'HEAT_ICE_ICE');
    expect(before.riskLevel).toBe('HIGH');
    expect(before.factors.length).toBeGreaterThan(2);
    expect(before.recommendation.actionItem.code).toBe('HEAT_HIGH_INSPECT_24H');
    expect(res.body.data.nextAction.recommendation.actionItem.actionSw).toMatch(/Kagua mistari/);
    expect(res.body.data.modelStatus.label).toBe('Rule-based baseline');
  });

  let recId;
  test('submitting an observation re-runs the AI: risk rises, recommendation changes, alert generated', async () => {
    const res = await api().post(`/api/farms/${farm.id}/observations`).set(auth(farmer))
      .send({ cropCondition: 'POOR', whitening: true, diseaseSymptoms: true, percentAffected: 30, breakage: false });
    expect(res.status).toBe(201);
    const heat = res.body.data.risk.predictions.find((p) => p.riskType === 'HEAT_ICE_ICE');
    expect(heat.probability).toBeGreaterThan(before.probability);
    expect(heat.riskLevel).toBe('CRITICAL');
    expect(heat.trigger).toBe('OBSERVATION');
    expect(heat.recommendation.actionItem.code).toBe('HEAT_CRITICAL_ESCALATE');
    expect(res.body.data.risk.alerts.map((a) => a.type)).toContain('HEAT_CRITICAL');
    recId = heat.recommendation.id;

    const notifications = await api().get('/api/notifications').set(auth(farmer));
    expect(notifications.body.data.notifications.some((n) => n.alertId)).toBe(true);
    // A CRITICAL alert triggers a real SMS attempt; without Africa's Talking credentials it is honestly logged as NOT_CONFIGURED.
    const smsLog = await prisma.notificationLog.findFirst({ where: { channel: 'SMS', messageType: 'RISK_ALERT' }, orderBy: { createdAt: 'desc' } });
    expect(smsLog.status).toBe('NOT_CONFIGURED');
    expect(smsLog.message).toMatch(/^MWANIMLINZI: .*FARM001.*HATARI KUBWA SANA. Hatua: /);
  });

  let actionId;
  test('farmer records the action taken, linked to the recommendation', async () => {
    const res = await api().post(`/api/farms/${farm.id}/actions`).set(auth(farmer)).send({ recommendationId: recId, actionTaken: true, notes: 'Called extension officer' });
    expect(res.status).toBe(201);
    actionId = res.body.data.action.id;
    const recs = await api().get(`/api/farms/${farm.id}/recommendations`).set(auth(farmer));
    expect(recs.body.data.recommendations.find((r) => r.id === recId).status).toBe('COMPLETED');
  });

  test('outcome links prediction → recommendation → action and creates a learning label', async () => {
    const res = await api().post(`/api/farms/${farm.id}/outcomes`).set(auth(farmer)).send({ farmerActionId: actionId, outcomeType: 'MINOR_LOSS', lossPercent: 5 });
    expect(res.status).toBe(201);
    const o = res.body.data.outcome;
    expect(o.recommendationId).toBe(recId);
    expect(o.predictionId).toBeTruthy();
    expect(o.riskMaterialized).toBe(true);
    expect(res.body.data.feedback.feedbackType).toBe('CORRECT');
  });

  test('harvest computes difference and loss %', async () => {
    const res = await api().post(`/api/farms/${farm.id}/harvests`).set(auth(farmer))
      .send({ harvestDate: new Date().toISOString().slice(0, 10), estimatedQuantity: 200, actualQuantity: 170, qualityGrade: 'B', dryingMethod: 'RACK', pricePerKg: 1000, closeCycle: false });
    expect(res.status).toBe(201);
    expect(res.body.data.harvest).toMatchObject({ differenceQuantity: -30, lossPercent: 15, totalValue: 170000 });
    expect(res.body.data.harvest.quality).toHaveLength(1);
  });

  test('history timeline contains the full loop', async () => {
    const res = await api().get(`/api/farms/${farm.id}/history`).set(auth(farmer));
    const types = new Set(res.body.data.events.map((e) => e.type));
    for (const t of ['OBSERVATION', 'ACTION', 'OUTCOME', 'HARVEST', 'ALERT', 'PLANTING']) expect(types.has(t)).toBe(true);
  });

  test('simulation changes risk without touching real predictions', async () => {
    const admin = await login('admin');
    const normal = await farmByCode(admin, 'FARM005');
    const res = await api().post('/api/risk/predict').set(auth(admin)).send({ farmId: normal.id, overrides: { waveHeightM: 2.5, windSpeedKmh: 45, rainfallMm: 25 } });
    expect(res.status).toBe(200);
    expect(res.body.data.isSimulation).toBe(true);
    const storm = res.body.data.predictions.find((p) => p.riskType === 'STORM_LINE_DAMAGE');
    const base = res.body.data.baseline.predictions.find((p) => p.riskType === 'STORM_LINE_DAMAGE');
    expect(storm.probability).toBeGreaterThan(base.probability);
    expect(storm.dataSource).toBe('SIMULATION');
    expect(res.body.data.alerts.every((a) => a.isSimulation)).toBe(true);
    const latest = await api().get(`/api/farms/${normal.id}/risks`).set(auth(admin));
    expect(latest.body.data.predictions.every((p) => !p.isSimulation)).toBe(true);
  });

  test('farmer can create a new farm with planting date; crop age is computed', async () => {
    const species = (await api().get('/api/species')).body.data.species[0];
    const plantingDate = new Date(Date.now() - 12 * 86400000).toISOString().slice(0, 10);
    const res = await api().post('/api/farms').set(auth(farmer)).send({
      name: 'Test farm', speciesId: species.id, latitude: -6.27, longitude: 39.55, locationName: 'Paje', district: 'Kusini', region: 'Unguja South', lineCount: 50, plantingDate,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.farm.cropAgeDays).toBe(12);
    expect(res.body.data.farm.latestRisks).not.toBeNull();
  });
});

describe('dashboards and forecasts', () => {
  test('cooperative dashboard has cards, charts and map farms', async () => {
    const res = await api().get('/api/cooperatives/mine/dashboard').set(auth(await login('cooperative')));
    expect(res.status).toBe(200);
    expect(res.body.data.cards).toEqual(expect.objectContaining({ totalFarmers: expect.any(Number), highRiskFarms: expect.any(Number), expectedHarvestKg30d: expect.any(Number) }));
    expect(res.body.data.farms[0].location.latitude).toBeDefined();
    expect(res.body.data.charts.riskDistribution.overall).toHaveLength(4);
  });

  test('extension dashboard prioritises visits', async () => {
    const res = await api().get('/api/extension/dashboard').set(auth(await login('extension')));
    expect(res.status).toBe(200);
    expect(res.body.data.visitPriority.length).toBeGreaterThan(0);
    expect(res.body.data.visitPriority[0].score).toBeGreaterThanOrEqual(res.body.data.visitPriority[1].score);
  });

  test('buyer forecast gives 7/14/30-day horizons with uncertainty ranges', async () => {
    const res = await api().get('/api/buyers/forecast?days=30').set(auth(await login('buyer')));
    const h = res.body.data.summary.horizons;
    expect(h.next7Days.riskAdjustedKg).toBeLessThanOrEqual(h.next14Days.riskAdjustedKg);
    expect(h.next30Days.lowKg).toBeLessThanOrEqual(h.next30Days.riskAdjustedKg);
    expect(h.next30Days.highKg).toBeGreaterThanOrEqual(h.next30Days.riskAdjustedKg);
  });

  test('admin can change risk thresholds (validated) and run jobs', async () => {
    const admin = await login('admin');
    expect((await api().put('/api/admin/settings/risk.thresholds').set(auth(admin)).send({ value: { MEDIUM: 0.7, HIGH: 0.6, CRITICAL: 0.8 } })).status).toBe(400);
    expect((await api().put('/api/admin/settings/risk.thresholds').set(auth(admin)).send({ value: { MEDIUM: 0.3, HIGH: 0.6, CRITICAL: 0.8 } })).status).toBe(200);
    const job = await api().post('/api/admin/jobs/harvest-forecasts/run').set(auth(admin));
    expect(job.status).toBe(200);
    expect(job.body.data.run.status).toBe('SUCCESS');
    const audit = await api().get('/api/admin/audit?action=UPDATE_SETTING').set(auth(admin));
    expect(audit.body.data.logs.length).toBeGreaterThan(0);
  });
});
