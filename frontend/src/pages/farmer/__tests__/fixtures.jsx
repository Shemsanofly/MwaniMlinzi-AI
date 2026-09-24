import { vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import { I18nProvider } from '../../../i18n/I18nProvider.jsx';

export const FARM = {
  id: '11111111-1111-4111-8111-111111111111', farmCode: 'FARM001', name: 'Paje Test Farm', isDemo: true, status: 'ACTIVE',
  cropAgeDays: 39, currentCycle: { id: 'c1', cropAgeDays: 39, daysToHarvest: 6, expectedHarvestDate: '2026-09-29T00:00:00.000Z', plantingDate: '2026-08-15T00:00:00.000Z', linesPlanted: 150, status: 'ACTIVE' },
};

export const farmerFarm = (overrides = {}) => ({
  farms: [FARM], farm: FARM, farmId: FARM.id, selectFarm: vi.fn(), isLoading: false, error: null, refetch: vi.fn(), ...overrides,
});

const rec = (id, riskType, validated = false) => ({
  id, status: 'PENDING', dueBy: '2026-09-24T11:00:00.000Z', riskType,
  actionItem: { id: `a-${id}`, riskType, action: 'Inspect lines within 24 hours', actionSw: 'Kagua mistari ndani ya saa 24', explanation: 'Heat stress is likely.', explanationSw: 'Joto ni kubwa.', urgency: 'URGENT', source: 'Demo rule set', validated, escalateToExtension: false },
});

export const prediction = (riskType, riskLevel, probability, withRec = false) => ({
  id: `p-${riskType}-${riskLevel}`, riskType, riskLevel, probability, confidence: 0.9, forecastHorizonHours: 72, modelType: 'RULE', modelVersion: 'rules-v1',
  explanation: `${riskType} explanation`, explanationSw: `${riskType} maelezo`, dataSource: 'DEMO', insufficientData: false, createdAt: '2026-09-23T10:00:00.000Z',
  factors: [{ code: 'SST_ANOMALY', label: 'Sea temperature is above normal', labelSw: 'Joto la bahari liko juu', value: '+1.5°C', contribution: 1.4, direction: 'INCREASES' }],
  recommendation: withRec ? rec(`r-${riskType}`, riskType) : null,
});

export const riskResult = (heatLevel = 'HIGH', heatP = 0.72) => {
  const predictions = [
    prediction('HEAT_ICE_ICE', heatLevel, heatP, true),
    prediction('STORM_LINE_DAMAGE', 'LOW', 0.07),
    prediction('POOR_GROWTH', 'LOW', 0.14),
    prediction('HARVEST_WINDOW', 'MEDIUM', 0.4),
  ];
  return {
    predictions,
    nextAction: { riskType: 'HEAT_ICE_ICE', riskLevel: heatLevel, recommendation: predictions[0].recommendation, reasons: predictions[0].factors },
    insufficientData: false, insufficientDataMessage: null,
    modelStatus: { mode: 'RULE', label: 'Rule-based baseline' },
    calculatedAt: '2026-09-23T10:00:00.000Z',
  };
};

export function renderPage(ui, { route = '/' } = {}) {
  try { localStorage.setItem('mwanimlinzi.lang', 'en'); } catch { /* ignore */ }
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>
        <I18nProvider>{ui}</I18nProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
