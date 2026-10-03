import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { farmApi } from '../../../../api/endpoints.js';
import FarmIntelligence from '../FarmIntelligence.jsx';
import { renderPage, FARM } from '../../__tests__/fixtures.jsx';

vi.mock('../../../../api/endpoints.js', () => ({ farmApi: { intelligence: vi.fn(), runRisks: vi.fn() } }));

const status = () => ({
  assessment: { mode: 'RULE', available: false, calculatedAt: '2026-10-02T06:00:00Z' },
  environment: { status: 'CACHED', weather: { provider: 'open-meteo', observedAt: '2026-10-02T06:00:00Z' }, ocean: null },
  records: { observations: 2, harvests: 1 }, harvest: { available: false, completedCycles: 1, minimumCycles: 3 },
  training: [{ riskType: 'HEAT_ICE_ICE', records: 1, minimumRecords: 300, ready: false }],
  assistant: { languageModelConfigured: false },
});

beforeEach(() => { vi.clearAllMocks(); farmApi.intelligence.mockResolvedValue(status()); farmApi.runRisks.mockResolvedValue({}); });

it('shows actual source identity, insufficient data and withheld harvest estimates', async () => {
  renderPage(<FarmIntelligence farmId={FARM.id} />);
  expect(await screen.findByText('Provisional assessment using farming rules')).toBeInTheDocument();
  expect(screen.getByText(/Weather: open-meteo/)).toBeInTheDocument();
  expect(screen.getByText('2 observations; 1 harvest records')).toBeInTheDocument();
  expect(screen.getByText(/Current data is insufficient/)).toBeInTheDocument();
  expect(screen.getByText(/Harvest quantity is unavailable/)).toBeInTheDocument();
  expect(screen.getByText(/1 \/ 300 labelled outcomes/)).toBeInTheDocument();
  expect(screen.getByText(/No live language model is configured/)).toBeInTheDocument();
});

it('refreshes the selected farm and reloads its readiness after analysis', async () => {
  const user = userEvent.setup();
  renderPage(<FarmIntelligence farmId={FARM.id} />);
  await screen.findByText('Provisional assessment using farming rules');
  await user.click(screen.getByRole('button', { name: 'Refresh farm analysis' }));
  await waitFor(() => expect(farmApi.runRisks).toHaveBeenCalledWith(FARM.id));
  await waitFor(() => expect(farmApi.intelligence).toHaveBeenCalledTimes(2));
  expect(await screen.findByText(/Analysis updated/)).toBeInTheDocument();
});

it('renders Kiswahili explanations for missing data and model readiness', async () => {
  renderPage(<FarmIntelligence farmId={FARM.id} />, { lang: 'sw' });
  expect(await screen.findByText('Tathmini ya awali kwa kanuni za kilimo')).toBeInTheDocument();
  expect(screen.getByText(/Hakuna modeli ya lugha iliyounganishwa/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sasisha uchambuzi wa shamba' })).toBeInTheDocument();
});
