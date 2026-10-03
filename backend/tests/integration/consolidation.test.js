import crypto from 'node:crypto';
import { api, auth, login, farmByCode } from '../helpers.js';
import prisma from '../../src/config/prisma.js';
import { farmRecords, events, environmentReadings } from '../../src/db/records.js';
import { latestDiseases } from '../../src/db/observations.js';
import { FarmService } from '../../src/services/farmService.js';
import { RecordService } from '../../src/services/recordService.js';

afterAll(() => prisma.$disconnect());

describe('consolidated database', () => {
  let farmer; let admin; let farm;
  beforeAll(async () => {
    farmer = await login('farmer');
    admin = await login('admin');
    farm = await farmByCode(farmer, 'FARM002');
  });

  test('has 29 application tables plus the migration table', async () => {
    const [{ count }] = await prisma.$queryRaw`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;
    expect(count).toBe(30);
  });

  test('record types cannot read, change or delete each other by ID', async () => {
    const sale = await farmRecords(prisma, 'SALE').create({ data: {
      farmId: farm.id, saleDate: new Date(), quantityKg: 2, pricePerKg: 1000, totalTzs: 2000,
      recordType: 'COST', // the repository must enforce its own type
    } });
    expect(sale.recordType).toBe('SALE');
    expect(await farmRecords(prisma, 'COST').findUnique({ where: { id: sale.id } })).toBeNull();
    await expect(farmRecords(prisma, 'COST').update({ where: { id: sale.id }, data: { amountTzs: 99 } })).rejects.toMatchObject({ code: 'P2025' });
    const wrongRoute = await api().delete(`/api/farms/${farm.id}/costs/${sale.id}`).set(auth(farmer));
    expect(wrongRoute.status).toBe(404);
    expect(wrongRoute.body.error.code).toBe('NOT_FOUND');
    const updated = await farmRecords(prisma, 'SALE').update({ where: { id: sale.id }, data: { recordType: 'COST', notes: 'Still a sale' } });
    expect(updated.recordType).toBe('SALE');
    expect(await farmRecords(prisma, 'COST').deleteMany({ where: { id: sale.id } })).toEqual({ count: 0 });
    await farmRecords(prisma, 'SALE').delete({ where: { id: sale.id } });
  });

  test('upload and audit repositories are isolated within the event table', async () => {
    const entry = await events(prisma, 'AUDIT').create({ data: { action: 'CONSOLIDATION_TEST', entityType: 'System' } });
    expect(await events(prisma, 'UPLOAD').findUnique({ where: { id: entry.id } })).toBeNull();
    expect((await api().get(`/api/uploads/${entry.id}`).set(auth(admin))).status).toBe(404);
    expect(await events(prisma, 'JOB').count({ where: { id: entry.id } })).toBe(0);
    await events(prisma, 'AUDIT').delete({ where: { id: entry.id } });
  });

  test('farm location edits preserve the other embedded fields and district filters still work', async () => {
    const original = await prisma.farm.findUnique({ where: { id: farm.id } });
    const copy = await prisma.farm.create({ data: {
      farmCode: `VERIFY-${crypto.randomUUID()}`, name: 'Location verification', farmerId: original.farmerId,
      speciesId: original.speciesId, location: { ...original.location, waterDepthM: 1.7 },
    } });
    try {
      await FarmService.update(copy.id, { latitude: -6.25, district: 'Verification District' });
      const saved = await prisma.farm.findUnique({ where: { id: copy.id } });
      expect(saved.location).toMatchObject({ latitude: -6.25, longitude: original.location.longitude, waterDepthM: 1.7, district: 'Verification District' });
      const list = await api().get('/api/farms?district=Verification%20District').set(auth(farmer));
      expect(list.status).toBe(200);
      expect(list.body.data.farms.some((f) => f.id === copy.id)).toBe(true);
    } finally { await prisma.farm.delete({ where: { id: copy.id } }); }
  });

  test('disease entries are saved with their observation and remain available in the staff feed', async () => {
    const owner = await prisma.farmer.findUnique({ where: { id: farm.farmer.id } });
    const { observation } = await RecordService.createObservation(farm.id, { id: owner.userId }, {
      cropCondition: 'FAIR', whitening: true, epiphytes: true, percentAffected: 35,
    }, { runRisk: false });
    try {
      expect(observation.diseases.map((d) => d.diseaseType)).toEqual(['ICE_ICE', 'EPIPHYTES']);
      expect(observation.diseases.every((d) => d.observationId === observation.id)).toBe(true);
      const feed = await latestDiseases(prisma, 100);
      expect(feed.filter((d) => d.observationId === observation.id)).toHaveLength(2);
    } finally { await prisma.farmObservation.delete({ where: { id: observation.id } }); }
  });

  test('raw weather readings retain their provenance and are separate from per-farm snapshots', async () => {
    const reading = await environmentReadings(prisma, 'WEATHER').create({ data: {
      latitude: -6.2, longitude: 39.3, source: 'LIVE', provider: 'consolidation-test', observedAt: new Date(), rainfallMm: 3,
    } });
    expect(await environmentReadings(prisma, 'OCEAN').findUnique({ where: { id: reading.id } })).toBeNull();
    expect(await environmentReadings(prisma, 'FARM').findUnique({ where: { id: reading.id } })).toBeNull();
    await environmentReadings(prisma, 'WEATHER').delete({ where: { id: reading.id } });
  });

  test('model administration separates model metrics from feedback and returns role permissions', async () => {
    const model = await prisma.mlModel.create({ data: {
      name: 'Consolidation test', version: crypto.randomUUID(), riskType: 'HEAT_ICE_ICE', algorithm: 'test',
      trainedAt: new Date(), trainingRecords: 10, testRecords: 2, syntheticData: false, featureNames: [], filePath: 'test.json',
    } });
    let metric;
    try {
      metric = await events(prisma, 'METRIC').create({ data: { modelId: model.id, dataset: 'TEST', metric: 'accuracy', value: 0.8 } });
      const res = await api().get('/api/admin/models').set(auth(admin));
      expect(res.status).toBe(200);
      expect(res.body.data.models.find((m) => m.id === model.id)).toMatchObject({ testMetrics: { accuracy: 0.8 }, feedbackCount: 0 });
      const roles = await api().get('/api/admin/roles').set(auth(admin));
      expect(roles.status).toBe(200);
      expect(roles.body.data.roles.find((r) => r.name === 'ADMIN').permissions).toContain('user:manage');
    } finally {
      if (metric) await events(prisma, 'METRIC').delete({ where: { id: metric.id } });
      await prisma.mlModel.delete({ where: { id: model.id } });
    }
  });
});
