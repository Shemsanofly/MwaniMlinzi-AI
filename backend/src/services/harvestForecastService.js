import prisma from '../config/prisma.js';
import { addDays, daysBetween, cropAgeDays } from '../utils/dates.js';
export const HARVEST_METHOD = 'recorded-cycle-yield-v2';
export const MIN_HARVEST_CYCLES = 3;
export const usableForecast = (forecast) => forecast?.method === HARVEST_METHOD ? forecast : null;

const round = (v, dp = 1) => Math.round(v * 10 ** dp) / 10 ** dp;

/**
 * Historical harvest planning estimate from completed cycles. No species default,
 * guessed loss deduction, inferred quality grade or invented harvest date.
 * All quantities are kg of dried seaweed; low/high reflect recorded yield variation.
 */
export function forecastForCycle({ cycle, history }) {
  const lines = cycle.linesPlanted;
  if (!(lines > 0) || !Number.isInteger(history.harvestCount) || history.harvestCount < MIN_HARVEST_CYCLES || !Number.isFinite(history.yieldPerLine)
    || !Number.isFinite(history.lowYieldPerLine) || !Number.isFinite(history.highYieldPerLine)) return null;
  const yieldPerLine = history.yieldPerLine;
  const expected = lines * yieldPerLine;
  const expectedDate = cycle.expectedHarvestDate;
  const overdue = daysBetween(expectedDate) > 0;
  return {
    expectedHarvestDate: expectedDate,
    expectedQuantityKg: round(expected),
    // Retain the legacy column name for API compatibility; no uncalibrated loss deduction.
    riskAdjustedQuantityKg: round(expected),
    lowQuantityKg: round(lines * history.lowYieldPerLine),
    highQuantityKg: round(lines * history.highYieldPerLine),
    confidence: 0, // Accuracy has not been measured; the farmer DTO exposes null.
    expectedGrade: null,
    inputs: {
      linesPlanted: lines,
      yieldKgDryPerLine: round(yieldPerLine, 2),
      yieldSource: 'FARM_HISTORY',
      completedCycles: history.harvestCount,
      harvestRecordIds: history.harvestRecordIds || [],
      rangeMeaning: 'Observed minimum and maximum yield per line in completed cycles; not a statistical prediction interval.',
      estimateKind: 'HISTORICAL_BASELINE',
      cropAgeDays: cropAgeDays(cycle.plantingDate),
      overdue,
    },
  };
}

export async function farmYieldHistory(farmId) {
  const harvests = await prisma.harvestRecord.findMany({
    where: { farmId, channel: { not: 'SEED' }, plantingCycle: { is: { status: 'HARVESTED', linesPlanted: { gt: 0 } } } },
    include: { plantingCycle: { select: { linesPlanted: true } } },
    orderBy: { harvestDate: 'desc' },
  });
  const cycles = new Map();
  for (const h of harvests) {
    const group = cycles.get(h.plantingCycleId) || { kg: 0, lines: h.plantingCycle.linesPlanted, ids: [], hasWet: false };
    group.hasWet ||= h.unit !== 'KG_DRY';
    group.kg += h.unit === 'KG_DRY' ? h.actualQuantity : 0;
    group.ids.push(h.id);
    cycles.set(h.plantingCycleId, group);
  }
  const recent = [...cycles.values()].filter((c) => !c.hasWet).slice(0, 6);
  const perLine = recent.map((c) => c.kg / c.lines);
  return { yieldPerLine: perLine.length ? perLine.reduce((a, b) => a + b, 0) / perLine.length : null,
    lowYieldPerLine: perLine.length ? Math.min(...perLine) : null, highYieldPerLine: perLine.length ? Math.max(...perLine) : null,
    harvestCount: recent.length, harvestRecordIds: recent.flatMap((c) => c.ids) };
}

export const HarvestForecastService = {
  /** Recompute forecasts for all active cycles (or one farm) and store them as current. */
  async generate({ farmId } = {}) {
    const cycles = await prisma.plantingCycle.findMany({
      where: { status: 'ACTIVE', ...(farmId ? { farmId } : {}), farm: { status: 'ACTIVE' } },
      include: { farm: { include: { species: true } } },
    });
    const results = [];
    await prisma.harvestForecast.updateMany({ where: { ...(farmId ? { farmId } : {}), isCurrent: true }, data: { isCurrent: false } });
    for (const cycle of cycles) {
      const { farm } = cycle;
      const history = await farmYieldHistory(farm.id);
      const f = forecastForCycle({ cycle, history });
      if (!f) continue;
      const row = await prisma.$transaction(async (tx) => {
        // Serialize simultaneous refreshes for one farm so supply is never counted twice.
        await tx.$queryRaw`SELECT id FROM farms WHERE id = ${farm.id}::uuid FOR UPDATE`;
        await tx.harvestForecast.updateMany({ where: { farmId: farm.id, isCurrent: true }, data: { isCurrent: false } });
        return tx.harvestForecast.create({
          data: {
            farmId: farm.id, cooperativeId: farm.cooperativeId, plantingCycleId: cycle.id, district: farm.location?.district || 'Unknown',
            ...f, method: HARVEST_METHOD,
          },
        });
      });
      results.push(row);
    }
    return results;
  },

  /** Current forecasts filtered by scope; used by the farmer and admin views. */
  async list({ where = {}, from, to, district, cooperativeId, minQuantityKg, grade } = {}) {
    return prisma.harvestForecast.findMany({
      where: {
        isCurrent: true,
        method: HARVEST_METHOD,
        ...where,
        ...(cooperativeId ? { cooperativeId } : {}),
        ...(district ? { district } : {}),
        ...(grade ? { expectedGrade: grade } : {}),
        ...(minQuantityKg ? { riskAdjustedQuantityKg: { gte: Number(minQuantityKg) } } : {}),
        ...(from || to ? { expectedHarvestDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
      },
      include: { farm: { select: { id: true, farmCode: true, name: true, species: { select: { commonName: true, code: true } } } }, cooperative: { select: { id: true, name: true, code: true } } },
      orderBy: { expectedHarvestDate: 'asc' },
    });
  },

  /** Aggregate forecasts into horizon buckets (next 7 / 14 / 30 days) and by cooperative, district and date. */
  aggregate(forecasts, now = new Date()) {
    const sum = (rows) => ({
      farms: rows.length,
      expectedKg: round(rows.reduce((s, r) => s + r.expectedQuantityKg, 0)),
      riskAdjustedKg: round(rows.reduce((s, r) => s + r.riskAdjustedQuantityKg, 0)),
      lowKg: round(rows.reduce((s, r) => s + r.lowQuantityKg, 0)),
      highKg: round(rows.reduce((s, r) => s + r.highQuantityKg, 0)),
      avgConfidence: rows.length ? round(rows.reduce((s, r) => s + r.confidence, 0) / rows.length, 2) : null,
    });
    const within = (days) => forecasts.filter((f) => new Date(f.expectedHarvestDate) <= addDays(now, days));
    const groupBy = (keyFn) => {
      const m = new Map();
      for (const f of forecasts) {
        const k = keyFn(f);
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(f);
      }
      return [...m.entries()].map(([key, rows]) => ({ key, ...sum(rows) }));
    };
    const weekKey = (d) => {
      const x = new Date(d);
      x.setUTCDate(x.getUTCDate() - x.getUTCDay());
      return x.toISOString().slice(0, 10);
    };
    return {
      unit: 'kg (dried seaweed)',
      horizons: { next7Days: sum(within(7)), next14Days: sum(within(14)), next30Days: sum(within(30)), all: sum(forecasts) },
      byCooperative: groupBy((f) => f.cooperative?.name || 'Independent'),
      byDistrict: groupBy((f) => f.district),
      byWeek: groupBy((f) => weekKey(f.expectedHarvestDate)).sort((a, b) => a.key.localeCompare(b.key)),
      uncertaintyNote: 'Estimates use recorded yields from at least three completed dry-harvest cycles. Ranges are observed historical yields, not calibrated prediction intervals. Dates are planting plans, not confirmed crop maturity.',
    };
  },
};
