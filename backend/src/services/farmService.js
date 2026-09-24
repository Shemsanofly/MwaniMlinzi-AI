import prisma from '../config/prisma.js';
import { addDays, cropAgeDays, daysBetween } from '../utils/dates.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { RISK_TYPES } from '../ai/constants.js';
import { farmInclude } from './farmContextService.js';

/** Farm DTO with derived fields: crop age (from planting date), current cycle, latest risk summary. */
export function serializeFarm(farm, { cycle = null, latestRisks = null, lastObservation = null, forecast = null } = {}) {
  const c = cycle || farm.plantingCycles?.find((pc) => pc.status === 'ACTIVE') || null;
  const age = c ? cropAgeDays(c.plantingDate) : null;
  return {
    id: farm.id,
    farmCode: farm.farmCode,
    name: farm.name,
    status: farm.status,
    isDemo: farm.isDemo,
    demoScenario: farm.demoScenario,
    farmingMethod: farm.farmingMethod,
    exposure: farm.exposure,
    anchoringMethod: farm.anchoringMethod,
    areaHectares: farm.areaHectares,
    lineCount: farm.lineCount,
    notes: farm.notes,
    createdAt: farm.createdAt,
    farmer: farm.farmer ? { id: farm.farmer.id, farmerCode: farm.farmer.farmerCode, fullName: farm.farmer.user?.fullName, phone: farm.farmer.user?.phone } : null,
    cooperative: farm.cooperative || null,
    species: farm.species ? { id: farm.species.id, code: farm.species.code, commonName: farm.species.commonName, commonNameSw: farm.species.commonNameSw, scientificName: farm.species.scientificName, typicalCycleDays: farm.species.typicalCycleDays } : null,
    location: farm.location ? { latitude: farm.location.latitude, longitude: farm.location.longitude, locationName: farm.location.locationName, district: farm.location.district, region: farm.location.region } : null,
    currentCycle: c ? {
      id: c.id,
      plantingDate: c.plantingDate,
      expectedHarvestDate: c.expectedHarvestDate,
      linesPlanted: c.linesPlanted,
      status: c.status,
      cropAgeDays: age,
      daysToHarvest: daysBetween(new Date(), c.expectedHarvestDate),
    } : null,
    plantingDate: c?.plantingDate || null,
    expectedHarvestDate: c?.expectedHarvestDate || null,
    cropAgeDays: age,
    latestRisks,
    lastObservation: lastObservation ? { id: lastObservation.id, observedAt: lastObservation.observedAt, cropCondition: lastObservation.cropCondition, whitening: lastObservation.whitening, breakage: lastObservation.breakage, epiphytes: lastObservation.epiphytes } : null,
    forecast: forecast ? { expectedHarvestDate: forecast.expectedHarvestDate, riskAdjustedQuantityKg: forecast.riskAdjustedQuantityKg, lowQuantityKg: forecast.lowQuantityKg, highQuantityKg: forecast.highQuantityKg, confidence: forecast.confidence } : null,
  };
}

/** Latest non-simulation prediction per risk type for many farms in one query set. */
export async function latestRiskSummaries(farmIds) {
  if (!farmIds.length) return {};
  const rows = await prisma.$queryRaw`
    SELECT DISTINCT ON (farm_id, risk_type) id, farm_id, risk_type, probability, risk_level, confidence, created_at
    FROM risk_predictions
    WHERE is_simulation = false AND farm_id::text = ANY(${farmIds})
    ORDER BY farm_id, risk_type, created_at DESC`;
  const out = {};
  for (const r of rows) {
    out[r.farm_id] ||= {};
    out[r.farm_id][r.risk_type] = { predictionId: r.id, probability: r.probability, level: r.risk_level, confidence: r.confidence, createdAt: r.created_at };
  }
  return out;
}

export function overallLevel(risks) {
  if (!risks) return null;
  const order = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  // Harvest window is an opportunity/timing signal, so it does not drive the farm's overall hazard level.
  const levels = RISK_TYPES.filter((rt) => rt !== 'HARVEST_WINDOW').map((rt) => risks[rt]?.level).filter(Boolean);
  return levels.length ? levels.reduce((a, b) => (order.indexOf(b) > order.indexOf(a) ? b : a)) : null;
}

export const FarmService = {
  async list(where, { take = 200, skip = 0 } = {}) {
    const farms = await prisma.farm.findMany({
      where,
      include: { ...farmInclude, plantingCycles: { where: { status: 'ACTIVE' }, orderBy: { plantingDate: 'desc' }, take: 1 } },
      orderBy: { farmCode: 'asc' },
      take,
      skip,
    });
    const ids = farms.map((f) => f.id);
    const [risks, lastObs, forecasts] = await Promise.all([
      latestRiskSummaries(ids),
      prisma.farmObservation.findMany({ where: { farmId: { in: ids } }, orderBy: { observedAt: 'desc' }, distinct: ['farmId'] }),
      prisma.harvestForecast.findMany({ where: { farmId: { in: ids }, isCurrent: true } }),
    ]);
    const obsBy = Object.fromEntries(lastObs.map((o) => [o.farmId, o]));
    const fcBy = Object.fromEntries(forecasts.map((f) => [f.farmId, f]));
    return farms.map((f) => {
      const dto = serializeFarm(f, { latestRisks: risks[f.id] || null, lastObservation: obsBy[f.id], forecast: fcBy[f.id] });
      dto.overallRiskLevel = overallLevel(risks[f.id]);
      return dto;
    });
  },

  async get(id) {
    const farm = await prisma.farm.findUnique({
      where: { id },
      include: { ...farmInclude, plantingCycles: { orderBy: { plantingDate: 'desc' } } },
    });
    if (!farm) throw notFound('Farm');
    const [risks, lastObs, forecast] = await Promise.all([
      latestRiskSummaries([id]),
      prisma.farmObservation.findFirst({ where: { farmId: id }, orderBy: { observedAt: 'desc' } }),
      prisma.harvestForecast.findFirst({ where: { farmId: id, isCurrent: true } }),
    ]);
    const dto = serializeFarm(farm, { latestRisks: risks[id] || null, lastObservation: lastObs, forecast });
    dto.overallRiskLevel = overallLevel(risks[id]);
    dto.plantingCycles = farm.plantingCycles.map((c) => ({ ...c, cropAgeDays: c.status === 'ACTIVE' ? cropAgeDays(c.plantingDate) : null }));
    return dto;
  },

  async nextFarmCode() {
    const count = await prisma.farm.count();
    for (let n = count + 1; n < count + 1000; n += 1) {
      const code = `FARM${String(n).padStart(3, '0')}`;
       
      if (!(await prisma.farm.findUnique({ where: { farmCode: code }, select: { id: true } }))) return code;
    }
    return `FARM-${Date.now()}`;
  },

  async create(farmerId, data) {
    const species = await prisma.seaweedSpecies.findUnique({ where: { id: data.speciesId } });
    if (!species) throw badRequest('Unknown seaweed species');
    if (data.cooperativeId) {
      const member = await prisma.cooperativeMember.findFirst({ where: { cooperativeId: data.cooperativeId, farmerId, isActive: true } });
      if (!member) throw badRequest('Farmer is not a member of this cooperative');
    }
    const farmCode = data.farmCode || (await this.nextFarmCode());
    if (await prisma.farm.findUnique({ where: { farmCode } })) throw conflict('Farm code already in use');
    const farm = await prisma.farm.create({
      data: {
        farmCode,
        name: data.name,
        farmerId,
        cooperativeId: data.cooperativeId || null,
        speciesId: data.speciesId,
        farmingMethod: data.farmingMethod,
        exposure: data.exposure,
        anchoringMethod: data.anchoringMethod,
        areaHectares: data.areaHectares ?? null,
        lineCount: data.lineCount,
        notes: data.notes || null,
        location: { create: { latitude: data.latitude, longitude: data.longitude, locationName: data.locationName, district: data.district, region: data.region } },
      },
    });
    if (data.plantingDate) {
      await this.startCycle(farm.id, {
        plantingDate: data.plantingDate,
        expectedHarvestDate: data.expectedHarvestDate,
        linesPlanted: data.linesPlanted || data.lineCount || 1,
      }, species);
    }
    return this.get(farm.id);
  },

  async update(id, data) {
    const { latitude, longitude, locationName, district, region, ...rest } = data;
    if (rest.speciesId && !(await prisma.seaweedSpecies.findUnique({ where: { id: rest.speciesId } }))) throw badRequest('Unknown seaweed species');
    const loc = Object.fromEntries(Object.entries({ latitude, longitude, locationName, district, region }).filter(([, v]) => v !== undefined));
    await prisma.farm.update({
      where: { id },
      data: { ...rest, ...(Object.keys(loc).length ? { location: { update: loc } } : {}) },
    });
    return this.get(id);
  },

  async startCycle(farmId, data, speciesArg) {
    const existing = await prisma.plantingCycle.findFirst({ where: { farmId, status: 'ACTIVE' } });
    if (existing) throw conflict('This farm already has an active planting cycle. Record its harvest or close it first.');
    const species = speciesArg || (await prisma.farm.findUnique({ where: { id: farmId }, include: { species: true } })).species;
    if (data.plantingDate > new Date()) throw badRequest('Planting date cannot be in the future');
    const expected = data.expectedHarvestDate || addDays(data.plantingDate, species.typicalCycleDays);
    if (expected <= data.plantingDate) throw badRequest('Expected harvest date must be after planting date');
    return prisma.plantingCycle.create({
      data: { farmId, plantingDate: data.plantingDate, expectedHarvestDate: expected, linesPlanted: data.linesPlanted, seedQuantityKg: data.seedQuantityKg ?? null, notes: data.notes || null },
    });
  },
};
