/**
 * Record book summary (pure). Every number comes from the farmer's own entries: sums of nothing are 0,
 * ratios without their inputs are null — nothing is estimated or filled in.
 */
const sum = (rows, key) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
const round = (v) => Math.round(v * 100) / 100;

export function recordSummary({ cycle = null, harvests = [], sales = [], costs = [], work = [] }) {
  const harvestedKg = round(sum(harvests.filter((h) => h.unit !== 'KG_WET'), 'actualQuantity'));
  const soldKg = round(sum(sales, 'quantityKg'));
  const incomeTzs = sum(sales, 'totalTzs');
  const owedTzs = sum(sales.filter((s) => s.paymentStatus === 'PENDING'), 'totalTzs');
  const costsTzs = sum(costs, 'amountTzs');
  const costsByCategory = {};
  for (const c of costs) costsByCategory[c.category] = (costsByCategory[c.category] || 0) + (Number(c.amountTzs) || 0);
  const profitTzs = incomeTzs - costsTzs;
  return {
    cycleId: cycle?.id ?? null,
    harvestedKg,
    soldKg,
    unsoldKg: round(Math.max(harvestedKg - soldKg, 0)),
    incomeTzs,
    owedTzs,
    costsTzs,
    costsByCategory,
    profitTzs,
    profitPerLine: cycle?.linesPlanted > 0 ? Math.round(profitTzs / cycle.linesPlanted) : null,
    averagePricePerKg: soldKg > 0 ? Math.round(incomeTzs / soldKg) : null,
    counts: { sales: sales.length, costs: costs.length, work: work.length, harvests: harvests.length },
  };
}
