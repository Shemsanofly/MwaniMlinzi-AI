import { ActionEngine, conditionsHold } from '../../src/ai/actionEngine.js';
import { ACTION_LIBRARY } from '../../prisma/data/actionLibrary.js';

const library = ACTION_LIBRARY.map((a, i) => ({ ...a, id: `a${i}` }));
const risk = (riskType, level, extra = {}) => ({ riskType, level, insufficientData: false, ...extra });

describe('ActionEngine', () => {
  test('selects approved heat actions by level', () => {
    expect(ActionEngine.select(risk('HEAT_ICE_ICE', 'LOW'), { maturityRatio: 0.5 }, library).code).toBe('HEAT_LOW_MONITOR');
    expect(ActionEngine.select(risk('HEAT_ICE_ICE', 'MEDIUM'), { maturityRatio: 0.5 }, library).code).toBe('HEAT_MEDIUM_INSPECT');
    const high = ActionEngine.select(risk('HEAT_ICE_ICE', 'HIGH'), { maturityRatio: 0.5 }, library);
    expect(high.code).toBe('HEAT_HIGH_INSPECT_24H');
    expect(high.actionSw).toMatch(/saa 24/);
    const crit = ActionEngine.select(risk('HEAT_ICE_ICE', 'CRITICAL'), { maturityRatio: 0.5 }, library);
    expect(crit.code).toBe('HEAT_CRITICAL_ESCALATE');
    expect(crit.escalateToExtension).toBe(true);
  });

  test('uses conditions for harvest actions', () => {
    expect(ActionEngine.select(risk('HARVEST_WINDOW', 'LOW'), { maturityRatio: 0.95, rainfallMm: 1 }, library).code).toBe('HARVEST_FAVORABLE');
    expect(ActionEngine.select(risk('HARVEST_WINDOW', 'LOW'), { maturityRatio: 0.5, rainfallMm: 1 }, library).code).toBe('HARVEST_NOT_READY');
    expect(ActionEngine.select(risk('HARVEST_WINDOW', 'MEDIUM'), { maturityRatio: 0.95, rainfallMm: 20 }, library).code).toBe('HARVEST_POOR_DRYING');
  });

  test('never recommends when data is insufficient', () => {
    expect(ActionEngine.select(risk('HEAT_ICE_ICE', 'HIGH', { insufficientData: true }), {}, library)).toBeNull();
  });

  test('respects requireValidated and disabled actions', () => {
    expect(ActionEngine.select(risk('HEAT_ICE_ICE', 'HIGH'), {}, library, { requireValidated: true })).toBeNull();
    const validated = library.map((a) => (a.code === 'HEAT_HIGH_INSPECT_24H' ? { ...a, validated: true } : a));
    expect(ActionEngine.select(risk('HEAT_ICE_ICE', 'HIGH'), {}, validated, { requireValidated: true }).code).toBe('HEAT_HIGH_INSPECT_24H');
    const disabled = library.map((a) => (a.code === 'HEAT_HIGH_INSPECT_24H' ? { ...a, enabled: false } : a));
    expect(ActionEngine.select(risk('HEAT_ICE_ICE', 'HIGH'), {}, disabled)).toBeNull();
  });

  test('conditions on missing features fail conservatively', () => {
    expect(conditionsHold([{ feature: 'rainfallMm', op: 'lte', value: 5 }], {})).toBe(false);
    expect(conditionsHold([{ feature: 'rainfallMm', op: 'lte', value: 5 }], { rainfallMm: 2 })).toBe(true);
    expect(conditionsHold(null, {})).toBe(true);
  });

  test('selectAll picks the most urgent next action', () => {
    const result = {
      features: { maturityRatio: 0.5, rainfallMm: 1 },
      risks: { HEAT_ICE_ICE: risk('HEAT_ICE_ICE', 'HIGH'), STORM_LINE_DAMAGE: risk('STORM_LINE_DAMAGE', 'MEDIUM'), POOR_GROWTH: risk('POOR_GROWTH', 'LOW'), HARVEST_WINDOW: risk('HARVEST_WINDOW', 'LOW') },
    };
    const sel = ActionEngine.selectAll(result, library);
    expect(sel.next.riskType).toBe('HEAT_ICE_ICE');
    expect(Object.values(sel.perRisk).every(Boolean)).toBe(true);
  });

  test('every seeded action is bilingual and marked for local validation', () => {
    for (const a of ACTION_LIBRARY) {
      expect(a.action).toBeTruthy();
      expect(a.actionSw).toBeTruthy();
      expect(a.validated).toBe(false);
      expect(a.source).toMatch(/local expert validation/);
    }
  });
});
