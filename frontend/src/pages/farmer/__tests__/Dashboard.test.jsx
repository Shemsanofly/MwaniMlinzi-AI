import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { farmApi, environmentApi, alertApi } from '../../../api/endpoints.js';
import { useFarmerFarm } from '../../../hooks/useFarmerFarm.js';
import DashboardPage from '../Dashboard.jsx';
import { FARM, farmerFarm, renderPage, riskResult } from './fixtures.jsx';

vi.mock('../../../api/endpoints.js', () => ({
  farmApi: { risks: vi.fn(), alerts: vi.fn(), addAction: vi.fn(), runRisks: vi.fn() },
  environmentApi: { current: vi.fn() },
  alertApi: { update: vi.fn() },
}));
vi.mock('../../../hooks/useFarmerFarm.js', () => ({ useFarmerFarm: vi.fn() }));
vi.mock('../../../stores/AuthContext.jsx', () => ({ useAuth: () => ({ user: { fullName: 'Mwanaisha Haji' }, memberships: [] }) }));

beforeEach(() => {
  vi.clearAllMocks();
  useFarmerFarm.mockReturnValue(farmerFarm());
  farmApi.risks.mockResolvedValue(riskResult('HIGH', 0.72));
  farmApi.alerts.mockResolvedValue({ alerts: [{ id: 'al1', severity: 'HIGH', status: 'ACTIVE', title: 'HIGH heat risk', titleSw: 'Hatari kubwa', message: 'Inspect lines', messageSw: 'Kagua', createdAt: new Date().toISOString() }] });
  environmentApi.current.mockResolvedValue({ current: { source: 'DEMO', seaSurfaceTempC: 27.5, sstAnomalyC: 1.5, waveHeightM: 0.3, windSpeedKmh: 7, rainfallMm: 0, observedAt: new Date().toISOString() } });
  farmApi.addAction.mockResolvedValue({ action: { id: 'act1', actionTaken: true } });
  alertApi.update.mockResolvedValue({ alert: { id: 'al1', status: 'ACKNOWLEDGED' } });
});

describe('Farmer dashboard', () => {
  it('shows greeting, crop age from the API, risks, next action, model status and demo env label', async () => {
    renderPage(<DashboardPage />);
    expect(screen.getByText('Hello, Mwanaisha')).toBeInTheDocument();
    expect(await screen.findByTestId('risk-tile-HEAT_ICE_ICE')).toHaveTextContent('72%');
    expect(screen.getByTestId('risk-tile-HEAT_ICE_ICE')).toHaveTextContent('High');
    expect(screen.getByTestId('risk-tile-STORM_LINE_DAMAGE')).toHaveTextContent('7%');
    expect(screen.getByText('39 days')).toBeInTheDocument();
    expect(screen.getByText('Inspect lines within 24 hours')).toBeInTheDocument();
    expect(screen.getByText('Sea temperature is above normal')).toBeInTheDocument();
    expect(screen.getByText('Rule-based baseline')).toBeInTheDocument();
    expect(await screen.findByText('Demo environmental data')).toBeInTheDocument();
    expect(await screen.findByText('HIGH heat risk')).toBeInTheDocument();
    expect(farmApi.risks).toHaveBeenCalledWith(FARM.id);
  });

  it('"I did this" records the action and prompts for the outcome', async () => {
    const user = userEvent.setup();
    renderPage(<DashboardPage />);
    await user.click(await screen.findByRole('button', { name: 'I did this' }));
    await waitFor(() => expect(farmApi.addAction).toHaveBeenCalledWith(FARM.id, { recommendationId: 'r-HEAT_ICE_ICE', actionTaken: true }));
    expect(await screen.findByText('Saved: you did this action.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Record the outcome' })).toHaveAttribute('href', '/farmer/history?action=act1#outcomes');
  });

  it('acknowledges an alert', async () => {
    const user = userEvent.setup();
    renderPage(<DashboardPage />);
    const alert = (await screen.findByText('HIGH heat risk')).closest('li');
    await user.click(within(alert).getByRole('button', { name: 'Acknowledge' }));
    await waitFor(() => expect(alertApi.update).toHaveBeenCalledWith('al1', 'ACKNOWLEDGED'));
  });

  it('shows a create-farm empty state when the farmer has no farm', () => {
    useFarmerFarm.mockReturnValue(farmerFarm({ farms: [], farm: null, farmId: null }));
    renderPage(<DashboardPage />);
    expect(screen.getByText('You have no farm yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add my farm' })).toHaveAttribute('href', '/farmer/farm');
  });
});
