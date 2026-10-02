import prisma from '../../src/config/prisma.js';
import { api, auth, login, farmByCode } from '../helpers.js';
import { farmYieldHistory, HarvestForecastService, HARVEST_METHOD } from '../../src/services/harvestForecastService.js';
import { EnvironmentService, getEnvironmentalProvider, setEnvironmentalProvider } from '../../src/services/environmentService.js';

afterAll(() => prisma.$disconnect());

describe('farmer intelligence API', () => {
  let farmer; let farm;
  beforeAll(async () => { farmer = await login('farmer'); farm = await farmByCode(farmer, 'FARM001'); });

  test('requires login and enforces farm ownership', async () => {
    expect((await api().get(`/api/farms/${farm.id}/intelligence`)).status).toBe(401);
    const other = await prisma.farm.findFirst({ where: { farmerId: { not: (await prisma.farm.findUnique({ where: { id: farm.id } })).farmerId } } });
    expect((await api().get(`/api/farms/${other.id}/intelligence`).set(auth(farmer))).status).toBe(403);
  });

  test('reports real data readiness without claiming trained AI or accuracy', async () => {
    const response = await api().get(`/api/farms/${farm.id}/intelligence`).set(auth(farmer));
    expect(response.status).toBe(200);
    const status = response.body.data;
    expect(status.assessment.mode).toBe('RULE');
    expect(status.assessment.measuredAccuracy).toBeNull();
    expect(status.training).toHaveLength(4);
    expect(status.training.every((r) => r.minimumRecords === 300 && r.minimumPerClass === 20)).toBe(true);
    expect(status.assistant).toEqual({ responseSource: 'FARM_RECORDS', languageModelConfigured: false });
    expect(status.environment.weather?.observedAt).toBeTruthy();
    expect(status.harvest.minimumCycles).toBe(3);
  });

  test('expired data is unavailable when the providers fail and refresh cannot relabel it as live', async () => {
    const previous = getEnvironmentalProvider();
    const original = await prisma.farm.create({ data: { farmerId: (await prisma.farm.findUnique({ where: { id: farm.id } })).farmerId,
      farmCode: 'REALDATA-EXPIRED', name: 'Isolated freshness test', speciesId: farm.species.id, farmingMethod: 'OFF_BOTTOM',
      location: { latitude: -6.2, longitude: 39.5 } } });
    try {
      await prisma.environmentalObservation.create({ data: { farmId: original.id, source: 'LIVE', observedAt: new Date(Date.now() - 49 * 3600000), seaSurfaceTempC: 27 } });
      setEnvironmentalProvider({ fetch: async () => ({ weather: null, ocean: null, errors: {} }), status: () => ({}) });
      expect(await EnvironmentService.currentForFarm(original, { maxAgeHours: 0 })).toBeNull();
      const response = await api().get(`/api/farms/${original.id}/intelligence`).set(auth(farmer));
      expect(response.body.data.environment.status).toBe('EXPIRED');
    } finally { setEnvironmentalProvider(previous); await prisma.farm.delete({ where: { id: original.id } }); }
  });

  test('multiple harvest batches count once per completed cycle and wet harvests are not converted', async () => {
    const original = await prisma.farm.findUnique({ where: { id: farm.id } });
    const testFarm = await prisma.farm.create({ data: { farmerId: original.farmerId, farmCode: 'REALDATA-HISTORY', name: 'Isolated yield test', speciesId: original.speciesId, farmingMethod: original.farmingMethod } });
    try {
      for (let i = 0; i < 3; i += 1) {
        const cycle = await prisma.plantingCycle.create({ data: { farmId: testFarm.id, plantingDate: new Date('2026-01-01'), expectedHarvestDate: new Date('2026-02-15'), linesPlanted: 100, status: 'HARVESTED' } });
        await prisma.harvestRecord.createMany({ data: [40, 60 + i * 10].map((actualQuantity) => ({ farmId: testFarm.id, plantingCycleId: cycle.id, harvestDate: new Date('2026-02-15'), actualQuantity, unit: 'KG_DRY', channel: 'APP' })) });
      }
      const history = await farmYieldHistory(testFarm.id);
      expect(history.harvestCount).toBe(3);
      expect(history.yieldPerLine).toBeCloseTo(1.1);
      expect(history.harvestRecordIds).toHaveLength(6);
      await prisma.plantingCycle.create({ data: { farmId: testFarm.id, plantingDate: new Date('2026-09-01'), expectedHarvestDate: new Date('2026-10-15'), linesPlanted: 100 } });
      const [forecast] = await HarvestForecastService.generate({ farmId: testFarm.id });
      expect(forecast.method).toBe(HARVEST_METHOD);
      expect(forecast.expectedQuantityKg).toBe(110);
      await Promise.all([HarvestForecastService.generate({ farmId: testFarm.id }), HarvestForecastService.generate({ farmId: testFarm.id })]);
      expect(await prisma.harvestForecast.count({ where: { farmId: testFarm.id, isCurrent: true } })).toBe(1);
      const oldCycle = await prisma.plantingCycle.findFirst({ where: { farmId: testFarm.id, status: 'HARVESTED' } });
      await prisma.harvestRecord.create({ data: { farmId: testFarm.id, plantingCycleId: oldCycle.id, harvestDate: new Date('2026-02-15'), actualQuantity: 100, unit: 'KG_WET' } });
      expect((await farmYieldHistory(testFarm.id)).harvestCount).toBe(2);
      expect(await HarvestForecastService.generate({ farmId: testFarm.id })).toEqual([]);
      expect(await prisma.harvestForecast.count({ where: { farmId: testFarm.id, isCurrent: true } })).toBe(0);
    } finally { await prisma.farm.delete({ where: { id: testFarm.id } }); }
  });
});
