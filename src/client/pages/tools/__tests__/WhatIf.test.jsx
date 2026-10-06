import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from '../../../test/router.jsx';
import { I18nProvider } from '../../../i18n/I18nProvider.jsx';
import { environmentApi, farmApi, riskApi } from '../../../api/endpoints.js';
import WhatIf from '../WhatIf.jsx';

vi.mock('../../../api/endpoints.js', () => ({
  farmApi: { list: vi.fn(), risks: vi.fn() },
  environmentApi: { current: vi.fn() },
  riskApi: { predict: vi.fn() },
}));

const pred = (riskType, riskLevel, probability, extra = {}) => ({
  id: `${riskType}-${riskLevel}`, riskType, riskLevel, probability, confidence: 0.8, forecastHorizonHours: 72,
  modelType: 'RULE', modelVersion: 'rules-v1', explanation: `${riskType} ${riskLevel}`, explanationSw: `${riskType} ${riskLevel}`,
  factors: [], dataSource: 'LIVE', ...extra,
});
const action = (code, text) => ({
  riskType: 'HEAT_ICE_ICE', riskLevel: 'LOW',
  recommendation: { id: code, status: 'PENDING', actionItem: { code, action: text, actionSw: text, explanation: 'x', explanationSw: 'x', urgency: 'SOON', validated: false } },
  reasons: [],
});

beforeEach(() => {
  localStorage.setItem('mwanimlinzi.lang', 'en');
  farmApi.list.mockResolvedValue({ farms: [{ id: 'farm-1', farmCode: 'FARM005', name: 'Bwejuu', location: { locationName: 'Bwejuu' }, cropAgeDays: 20 }] });
  farmApi.risks.mockResolvedValue({ predictions: [pred('HEAT_ICE_ICE', 'LOW', 0.1)], modelStatus: { label: 'Rule-based baseline' } });
  environmentApi.current.mockResolvedValue({
    current: { source: 'LIVE', seaSurfaceTempC: 26, sstAnomalyC: 0.3, sstAnomalyDays: 1, waveHeightM: 0.5, windSpeedKmh: 12, rainfallMm: 2, currentVelocityMs: 0.3, salinityPsu: 34.5 },
  });
  riskApi.predict.mockResolvedValue({
    isSimulation: true,
    calculatedAt: '2026-09-24T00:00:00Z',
    modelStatus: { mode: 'RULE', label: 'Rule-based baseline' },
    predictions: [pred('HEAT_ICE_ICE', 'HIGH', 0.78, { features: { sstAnomalyC: 2, cropAgeDays: 20, __missing: [] }, factors: [{ code: 'SST', label: 'Sea is hot', labelSw: 'Bahari ina joto', contribution: 1, direction: 'INCREASES', value: '+2.0°C' }] })],
    nextAction: action('HEAT_HIGH_INSPECT_24H', 'Inspect lines within 24 hours'),
    alerts: [{ id: 'a1', severity: 'HIGH', title: '[SIMULATION] Risk increased', titleSw: '[MAJARIBIO]', message: 'Heat risk rose', messageSw: 'x' }],
    baseline: { predictions: [pred('HEAT_ICE_ICE', 'LOW', 0.1)], nextAction: action('HEAT_LOW_MONITOR', 'Continue normal monitoring') },
    environment: null,
  });
});

test('sends the slider values as overrides to riskApi.predict and renders before/after', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><MemoryRouter><I18nProvider><WhatIf /></I18nProvider></MemoryRouter></QueryClientProvider>);

  // Sliders start from the current environment.
  const anomaly = await screen.findByLabelText('Sea temperature anomaly');
  expect(anomaly).toHaveValue(0.3);

  await userEvent.click(screen.getByRole('button', { name: 'Marine heatwave' }));
  expect(anomaly).toHaveValue(2);
  await userEvent.click(screen.getByRole('button', { name: /Run AI/ }));

  expect(riskApi.predict).toHaveBeenCalledWith('farm-1', expect.objectContaining({
    sstAnomalyC: 2, sstAnomalyDays: 8, waveHeightM: 0.3, windSpeedKmh: 8, rainfallMm: 0, currentVelocityMs: 0.1, salinityPsu: 34.5,
  }));

  const row = await screen.findByTestId('compare-HEAT_ICE_ICE');
  expect(within(row).getByText('Low')).toBeInTheDocument();
  expect(within(row).getByText('High')).toBeInTheDocument();
  expect(within(row).getByText('10%')).toBeInTheDocument();
  expect(within(row).getByText('78%')).toBeInTheDocument();
  expect(within(row).getByText('+68 pp')).toBeInTheDocument();

  // Recommendations before vs after, simulation labelling and the executed pipeline.
  expect(screen.getByText('Continue normal monitoring')).toBeInTheDocument();
  expect(screen.getAllByText('Inspect lines within 24 hours').length).toBeGreaterThan(0);
  expect(screen.getAllByText(/What-if result/i).length).toBeGreaterThan(0);
  expect(screen.getByText('[SIMULATION] Risk increased')).toBeInTheDocument();
  expect(screen.getByText(/Selected a recommendation from the Action Library/)).toBeInTheDocument();
  expect(screen.getByText('Sea is hot')).toBeInTheDocument();
});

function renderWhatIf() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><I18nProvider><WhatIf /></I18nProvider></MemoryRouter></QueryClientProvider>);
}

test('explains that it needs a real reading when the farm has none yet', async () => {
  environmentApi.current.mockResolvedValue({ current: null });
  renderWhatIf();
  expect(await screen.findByText(/No live reading for this farm yet — the what-if planner starts from the latest real reading/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Run AI/ })).toBeNull();
});

test('marks inputs that have no value in the real reading instead of inventing one silently', async () => {
  environmentApi.current.mockResolvedValue({
    current: { source: 'LIVE', seaSurfaceTempC: 26, sstAnomalyC: 0.3, sstAnomalyDays: 1, waveHeightM: 0.5, windSpeedKmh: 12, rainfallMm: 2, currentVelocityMs: 0.3, salinityPsu: null },
  });
  renderWhatIf();
  const salinity = await screen.findByRole('spinbutton', { name: /Salinity/ });
  expect(salinity).toHaveValue(35);
  expect(screen.getByText('No reading — starts at a typical value')).toBeInTheDocument();
});

test('shows an honest empty state when no farms are registered', async () => {
  farmApi.list.mockResolvedValue({ farms: [] });
  renderWhatIf();
  expect(await screen.findByText('No farms registered yet. The what-if planner needs at least one farm.')).toBeInTheDocument();
});
