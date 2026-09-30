import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderPage } from './testUtils.jsx';
import StaffFarmDetail from '../FarmDetail.jsx';
import { farmApi } from '../../../api/endpoints.js';

let roles = ['ADMIN'];
vi.mock('../../../stores/AuthContext.jsx', () => ({ useAuth: () => ({ user: { roles }, hasRole: (...r) => roles.some((x) => r.includes(x)) }) }));
vi.mock('../../../api/endpoints.js', () => ({
  farmApi: { get: vi.fn(), risks: vi.fn(), runRisks: vi.fn(), notes: vi.fn(), addNote: vi.fn(), environment: vi.fn(), outlook: vi.fn() },
  riskApi: { flag: vi.fn() },
  alertApi: { update: vi.fn() },
  extensionApi: { reviewObservation: vi.fn() },
  uploadApi: { imageUrl: vi.fn() },
}));
vi.mock('../../../components/map/FarmMap.jsx', () => ({ default: () => <div data-testid="map" /> }));

const farm = { id: 'f1', farmCode: 'FARM001', name: 'Paje Kusini', status: 'ACTIVE', overallRiskLevel: 'HIGH', farmer: { fullName: 'Mwanaisha' }, currentCycle: null, location: null };
const prediction = { id: 'p1', riskType: 'HEAT_ICE_ICE', riskLevel: 'HIGH', probability: 0.76, confidence: 0.89, forecastHorizonHours: 72, factors: [], dataSource: 'LIVE', modelType: 'RULE', createdAt: new Date().toISOString() };

describe('Staff farm detail', () => {
  beforeEach(() => {
    farmApi.get.mockResolvedValue({ farm });
    farmApi.risks.mockResolvedValue({ predictions: [prediction], nextAction: null, modelStatus: { label: 'Rule-based baseline' }, calculatedAt: prediction.createdAt });
    farmApi.runRisks.mockResolvedValue({});
    farmApi.notes.mockResolvedValue({ notes: [] });
    farmApi.addNote.mockResolvedValue({ note: { id: 'n1' } });
  });

  it('overview shows the farm daily sea outlook (tides + drying) next to the environment', async () => {
    roles = ['ADMIN'];
    farmApi.environment.mockResolvedValue({ current: null, history: [] });
    farmApi.outlook.mockResolvedValue({ outlook: null });
    renderPage(<StaffFarmDetail />, { route: '/admin/farms/f1', path: '/admin/farms/:id' });
    expect(await screen.findByText('No sea forecast for this farm yet')).toBeInTheDocument();
    expect(farmApi.outlook).toHaveBeenCalledWith('f1');
  });

  it('admins can flag predictions and recalculate risk', async () => {
    roles = ['ADMIN'];
    renderPage(<StaffFarmDetail />, { route: '/admin/farms/f1?tab=risk', path: '/admin/farms/:id' });
    expect(await screen.findByText('Heat / Ice-Ice')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Flag prediction' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Recalculate risk' }));
    await waitFor(() => expect(farmApi.runRisks).toHaveBeenCalledWith('f1'));
  });

  it('farmers cannot flag or add an extension note', async () => {
    roles = ['FARMER'];
    renderPage(<StaffFarmDetail />, { route: '/admin/farms/f1?tab=risk', path: '/admin/farms/:id' });
    expect(await screen.findByText('Heat / Ice-Ice')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Flag prediction' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Extension notes/ }));
    expect(screen.queryByLabelText(/^Note/)).not.toBeInTheDocument();
  });
});
