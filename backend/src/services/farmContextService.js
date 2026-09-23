import prisma from '../config/prisma.js';
import { cropAgeDays, daysBetween } from '../utils/dates.js';
import { notFound } from '../utils/errors.js';
import { computeSstPersistence, EnvironmentService } from './environmentService.js';

export const farmInclude = {
  species: true,
  location: true,
  cooperative: { select: { id: true, name: true, code: true } },
  farmer: { include: { user: { select: { id: true, fullName: true, phone: true, preferredLanguage: true } } } },
};

export async function activeCycle(farmId) {
  return prisma.plantingCycle.findFirst({ where: { farmId, status: 'ACTIVE' }, orderBy: { plantingDate: 'desc' } });
}

export async function farmHistory(farmId) {
  const cycles = await prisma.plantingCycle.findMany({
    where: { farmId, status: { in: ['HARVESTED', 'FAILED'] } },
    select: { id: true, losses: { select: { cause: true, percentLost: true } } },
  });
  const harvests = await prisma.harvestRecord.findMany({
    where: { farmId, estimatedQuantity: { gt: 0 } },
    select: { actualQuantity: true, estimatedQuantity: true },
    orderBy: { harvestDate: 'desc' },
    take: 6,
  });
  const n = cycles.length;
  const rate = (cause) => (n ? cycles.filter((c) => c.losses.some((l) => l.cause === cause && l.percentLost >= 10)).length / n : 0);
  const yieldRatio = harvests.length ? harvests.reduce((s, h) => s + h.actualQuantity / h.estimatedQuantity, 0) / harvests.length : null;
  return { pastCycles: n, iceIceLossRate: rate('ICE_ICE'), stormLossRate: rate('STORM'), yieldRatio, harvestCount: harvests.length };
}

/**
 * FarmContextService — assembles everything the AI needs about one farm:
 * farm profile, active planting cycle (crop age derived from planting date),
 * latest environment (refreshed via providers if stale), latest observation, history.
 */
export const FarmContextService = {
  async build(farmId, { refreshEnvironment = true, overrides = null } = {}) {
    const farm = await prisma.farm.findUnique({ where: { id: farmId }, include: farmInclude });
    if (!farm) throw notFound('Farm');
    const cycle = await activeCycle(farmId);
    const env = refreshEnvironment ? await EnvironmentService.currentForFarm(farm) : await EnvironmentService.latestForFarm(farmId);
    const persistence = await computeSstPersistence(farmId, null);
    const obs = await prisma.farmObservation.findFirst({
      where: { farmId, observedAt: { gte: new Date(Date.now() - 14 * 86400000) } },
      orderBy: { observedAt: 'desc' },
    });
    const history = await farmHistory(farmId);

    let environment = env ? { ...env, sstTrend7d: persistence.sstTrend7d, sstAnomalyDays: env.sstAnomalyDays ?? persistence.sstAnomalyDays } : null;
    if (overrides) environment = applyOverrides(environment, overrides);

    const age = cycle ? cropAgeDays(cycle.plantingDate) : null;
    const expectedCycleDays = cycle ? Math.max(1, daysBetween(cycle.plantingDate, cycle.expectedHarvestDate)) : farm.species.typicalCycleDays;
    return {
      farm,
      cycle,
      cropAgeDays: age,
      expectedCycleDays,
      environment,
      recentObservation: obs ? { ...obs, ageDays: daysBetween(obs.observedAt) } : null,
      history,
    };
  },
};

/** Simulation overrides replace provider values in-memory only (never stored as environmental data). */
export function applyOverrides(environment, overrides) {
  const base = environment ? { ...environment } : {};
  const map = { sstAnomalyC: 'sstAnomalyC', waveHeightM: 'waveHeightM', windSpeedKmh: 'windSpeedKmh', rainfallMm: 'rainfallMm', seaSurfaceTempC: 'seaSurfaceTempC', currentVelocityMs: 'currentVelocityMs', salinityPsu: 'salinityPsu', sstAnomalyDays: 'sstAnomalyDays' };
  for (const [k, field] of Object.entries(map)) {
    if (overrides[k] !== undefined && overrides[k] !== null) base[field] = Number(overrides[k]);
  }
  if (overrides.sstAnomalyC !== undefined && overrides.seaSurfaceTempC === undefined && environment?.seaSurfaceTempC != null && environment?.sstAnomalyC != null) {
    base.seaSurfaceTempC = Math.round((environment.seaSurfaceTempC - environment.sstAnomalyC + Number(overrides.sstAnomalyC)) * 100) / 100;
  }
  if (overrides.sstAnomalyC !== undefined && overrides.sstAnomalyDays === undefined) {
    base.sstAnomalyDays = Number(overrides.sstAnomalyC) > 0.5 ? Math.max(1, environment?.sstAnomalyDays || 0) : 0;
  }
  base.source = 'SIMULATION';
  return base;
}
