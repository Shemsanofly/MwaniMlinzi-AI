import { recordSummary } from '../../src/services/recordBook.js';

const cycle = { id: 'c1', linesPlanted: 100, plantingDate: new Date('2026-08-01'), status: 'HARVESTED' };
const sale = (kg, price, status = 'PAID') => ({ quantityKg: kg, pricePerKg: price, totalTzs: Math.round(kg * price), paymentStatus: status });
const cost = (category, amountTzs) => ({ category, amountTzs });

describe('recordSummary — profit per cycle from the farmer\'s own entries', () => {
  test('income, owed, costs by category, profit, per line and average price', () => {
    const s = recordSummary({
      cycle,
      harvests: [{ actualQuantity: 130, unit: 'KG_DRY' }, { actualQuantity: 400, unit: 'KG_WET' }],
      sales: [sale(100, 1000), sale(20, 900, 'PENDING')],
      costs: [cost('SEEDLINGS', 30000), cost('ROPE_LINES', 20000), cost('SEEDLINGS', 5000)],
      work: [{}, {}, {}],
    });
    expect(s).toMatchObject({
      harvestedKg: 130, // wet harvests are not dried seaweed and are not counted
      soldKg: 120,
      unsoldKg: 10,
      incomeTzs: 118000,
      owedTzs: 18000,
      costsTzs: 55000,
      costsByCategory: { SEEDLINGS: 35000, ROPE_LINES: 20000 },
      profitTzs: 63000,
      profitPerLine: 630,
      averagePricePerKg: 983,
      counts: { sales: 2, costs: 3, work: 3, harvests: 2 },
    });
  });

  test('nothing recorded → zeros for sums, null for ratios (never invented)', () => {
    const s = recordSummary({ cycle: null, harvests: [], sales: [], costs: [], work: [] });
    expect(s).toMatchObject({ harvestedKg: 0, soldKg: 0, unsoldKg: 0, incomeTzs: 0, costsTzs: 0, profitTzs: 0, profitPerLine: null, averagePricePerKg: null });
  });

  test('sales without a harvest record never give negative stock; no lines → no per-line profit', () => {
    const s = recordSummary({ cycle: { ...cycle, linesPlanted: 0 }, harvests: [], sales: [sale(50, 800)], costs: [], work: [] });
    expect(s.unsoldKg).toBe(0);
    expect(s.averagePricePerKg).toBe(800);
    expect(s.profitPerLine).toBeNull();
  });
});
