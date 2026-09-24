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
  it('shows the simple view: farm, crop age, risk in words + icon, simple reasons, next action with timing, alert, last report, expected harvest', async () => {
    renderPage(<DashboardPage />);
    expect(screen.getByText('Hello, Mwanaisha')).toBeInTheDocument();
    expect(screen.getByText('39 days')).toBeInTheDocument();
    expect(screen.getByText('about 182 kg')).toBeInTheDocument();
    const risk = await screen.findByTestId('current-risk');
    expect(risk).toHaveTextContent('High risk');
    expect(risk.querySelector('svg')).not.toBeNull(); // icon, not colour alone
    expect(risk).toHaveTextContent('The sea is warmer than normal');
    expect(risk).not.toHaveTextContent('%');
    const next = screen.getByTestId('next-action');
    expect(next).toHaveTextContent('Inspect lines within 24 hours');
    expect(next).toHaveTextContent('When: Urgent');
    expect(await screen.findByRole('alert')).toHaveTextContent('HIGH heat risk');
    expect(screen.getByText('Some problems seen')).toBeInTheDocument();
    for (const name of ['Inspect farm', 'Record symptoms', 'Record harvest', 'Ask AI']) expect(screen.getByRole('link', { name: new RegExp(name) })).toBeInTheDocument();
    // Technical values are hidden until "See details" is opened.
    expect(screen.queryByTestId('risk-tile-HEAT_ICE_ICE')).toBeNull();
    expect(screen.queryByText('Rule-based baseline')).toBeNull();
    expect(environmentApi.current).not.toHaveBeenCalled();
    expect(farmApi.risks).toHaveBeenCalledWith(FARM.id);
  });

  it('"See details" reveals probabilities, model status and environment data', async () => {
    const user = userEvent.setup();
    renderPage(<DashboardPage />);
    await screen.findByTestId('current-risk');
    await user.click(screen.getByRole('button', { name: 'See details' }));
    expect(screen.getByTestId('risk-tile-HEAT_ICE_ICE')).toHaveTextContent('72%');
    expect(screen.getByTestId('risk-tile-STORM_LINE_DAMAGE')).toHaveTextContent('7%');
    expect(screen.getByText('Rule-based baseline')).toBeInTheDocument();
    expect(await screen.findByText('Demo environmental data')).toBeInTheDocument();
  });

  it('is fully in Kiswahili when Kiswahili is selected', async () => {
    renderPage(<DashboardPage />, { lang: 'sw' });
    const risk = await screen.findByTestId('current-risk');
    expect(risk).toHaveTextContent('Hatari kubwa');
    expect(risk).toHaveTextContent('Maji ya bahari yana joto kuliko kawaida');
    expect(risk).not.toHaveTextContent('The sea');
    expect(screen.getByTestId('next-action')).toHaveTextContent('Kagua mistari ndani ya saa 24');
    expect(screen.getByRole('button', { name: 'Angalia maelezo' })).toBeInTheDocument();
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
    await screen.findByTestId('current-risk');
    await user.click(screen.getByRole('button', { name: 'See details' }));
    const alert = (await screen.findAllByText('HIGH heat risk')).map((el) => el.closest('li')).find(Boolean);
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
