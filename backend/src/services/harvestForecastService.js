import prisma from '../config/prisma.js';
import { addDays, daysBetween, cropAgeDays } from '../utils/dates.js';
import { RISK_TYPES } from '../ai/constants.js';

const round = (v, dp = 1) => Math.round(v * 10 ** dp) / 10 ** dp;

/**
 * HarvestForecastService — risk-adjusted expected harvest per farm, aggregated by
 * cooperative / district / date. All quantities are kg of DRIED seaweed.
 *
 *   expected      = lines planted × yield per line (farm history if available, else species default)
 *   riskAdjusted  = expected × (1 − expected loss fraction from current risk probabilities)
 *   range         = widened by uncertainty (less history, lower confidence ⇒ wider range)
 */
export function forecastForCycle({ farm, cycle, species, latestRisks, history }) {
  const lines = cycle.linesPlanted || farm.lineCount || 0;
  const yieldPerLine = history.yieldPerLine ?? species.yieldKgDryPerLine;
  const expected = lines * yieldPerLine;
  const p = (rt) => latestRisks[rt]?.probability ?? 0;
  const lossFraction = Math.min(0.85, 0.35 * p('HEAT_ICE_ICE') + 0.25 * p('STORM_LINE_DAMAGE') + 0.2 * p('POOR_GROWTH') + 0.1 * p('HARVEST_WINDOW'));
  const riskAdjusted = expected * (1 - lossFraction);
  const avgConfidence = RISK_TYPES.map((rt) => latestRisks[rt]?.confidence).filter((v) => v != null);
  const riskConfidence = avgConfidence.length ? avgConfidence.reduce((a, b) => a + b, 0) / avgConfidence.length : 0.4;
  const historyFactor = Math.min(1, (history.harvestCount || 0) / 3);
  const confidence = round(Math.min(0.9, 0.35 + 0.3 * riskConfidence + 0.25 * historyFactor), 2);
  const uncertainty = 0.45 - 0.3 * confidence; // 0.18 … 0.35
  const expectedDate = cycle.expectedHarvestDate;
  const overdue = daysBetween(expectedDate) > 0;
  return {
    expectedHarvestDate: overdue ? addDays(new Date(), 3) : expectedDate,
    expectedQuantityKg: round(expected),
    riskAdjustedQuantityKg: round(riskAdjusted),
    lowQuantityKg: round(riskAdjusted * (1 - uncertainty)),
    highQuantityKg: round(Math.min(expected * (1 + uncertainty / 2), riskAdjusted * (1 + uncertainty))),
    confidence,
    expectedGrade: p('HARVEST_WINDOW') > 0.6 || p('HEAT_ICE_ICE') > 0.6 ? 'B' : 'A',
    inputs: {
      linesPlanted: lines,
      yieldKgDryPerLine: round(yieldPerLine, 2),
      yieldSource: history.yieldPerLine != null ? 'FARM_HISTORY' : 'SPECIES_DEFAULT',
      cropAgeDays: cropAgeDays(cycle.plantingDate),
      expectedLossFraction: round(lossFraction, 3),
      riskProbabilities: Object.fromEntries(RISK_TYPES.map((rt) => [rt, latestRisks[rt]?.probability ?? null])),
      overdue,
    },
  };
}

async function farmYieldHistory(farmId) {
  const harvests = await prisma.harvestRecord.findMany({
    where: { farmId, unit: 'KG_DRY', plantingCycle: { is: { linesPlanted: { gt: 0 } } } },
    include: { plantingCycle: { select: { linesPlanted: true } } },
    orderBy: { harvestDate: 'desc' },
    take: 4,
  });
  if (!harvests.length) return { yieldPerLine: null, harvestCount: 0 };
  const perLine = harvests.map((h) => h.actualQuantity / h.plantingCycle.linesPlanted);
  return { yieldPerLine: perLine.reduce((a, b) => a + b, 0) / perLine.length, harvestCount: harvests.length };
}

export const HarvestForecastService = {
  /** Recompute forecasts for all active cycles (or one farm) and store them as current. */
  async generate({ farmId } = {}) {
    const cycles = await prisma.plantingCycle.findMany({
      where: { status: 'ACTIVE', ...(farmId ? { farmId } : {}), farm: { status: 'ACTIVE' } },
      include: { farm: { include: { species: true, location: true } } },
    });
    const results = [];
    for (const cycle of cycles) {
      const { farm } = cycle;
      const latest = await Promise.all(RISK_TYPES.map((riskType) => prisma.riskPrediction.findFirst({ where: { farmId: farm.id, riskType, isSimulation: false }, orderBy: { createdAt: 'desc' }, select: { riskType: true, probability: true, confidence: true } })));
      const latestRisks = Object.fromEntries(latest.filter(Boolean).map((r) => [r.riskType, r]));
      const history = await farmYieldHistory(farm.id);
      const f = forecastForCycle({ farm, cycle, species: farm.species, latestRisks, history });
      const [, row] = await prisma.$transaction([
        prisma.harvestForecast.updateMany({ where: { farmId: farm.id, isCurrent: true }, data: { isCurrent: false } }),
        prisma.harvestForecast.create({
          data: {
            farmId: farm.id, cooperativeId: farm.cooperativeId, plantingCycleId: cycle.id, district: farm.location?.district || 'Unknown',
            ...f, method: 'risk-adjusted-yield-v1', isDemo: farm.isDemo,
          },
        }),
      ]);
      results.push(row);
    }
    return results;
  },

  /** Current forecasts filtered by scope; used by cooperative, buyer and admin views. */
  async list({ where = {}, from, to, district, cooperativeId, minQuantityKg, grade } = {}) {
    return prisma.harvestForecast.findMany({
      where: {
        isCurrent: true,
        ...where,
        ...(cooperativeId ? { cooperativeId } : {}),
        ...(district ? { district } : {}),
        ...(grade ? { expectedGrade: grade } : {}),
        ...(minQuantityKg ? { riskAdjustedQuantityKg: { gte: Number(minQuantityKg) } } : {}),
        ...(from || to ? { expectedHarvestDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
      },
      include: { farm: { select: { id: true, farmCode: true, name: true, isDemo: true, species: { select: { commonName: true, code: true } } } }, cooperative: { select: { id: true, name: true, code: true } } },
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
      uncertaintyNote: 'Ranges reflect model uncertainty from current risk levels, prediction confidence and farm harvest history. Forecasts are estimates, not guarantees.',
    };
  },
};
