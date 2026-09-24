import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderPage } from './testUtils.jsx';
import StaffFarmDetail from '../FarmDetail.jsx';
import { farmApi } from '../../../api/endpoints.js';

let roles = ['EXTENSION_OFFICER'];
vi.mock('../../../stores/AuthContext.jsx', () => ({ useAuth: () => ({ user: { roles }, hasRole: (...r) => roles.some((x) => r.includes(x)) }) }));
vi.mock('../../../api/endpoints.js', () => ({
  farmApi: { get: vi.fn(), risks: vi.fn(), runRisks: vi.fn(), notes: vi.fn(), addNote: vi.fn(), environment: vi.fn() },
  riskApi: { flag: vi.fn() },
  alertApi: { update: vi.fn() },
  extensionApi: { reviewObservation: vi.fn() },
  uploadApi: { imageUrl: vi.fn() },
}));
vi.mock('../../../components/map/FarmMap.jsx', () => ({ default: () => <div data-testid="map" /> }));

const farm = { id: 'f1', farmCode: 'FARM001', name: 'Paje Kusini', status: 'ACTIVE', isDemo: true, overallRiskLevel: 'HIGH', farmer: { fullName: 'Mwanaisha' }, currentCycle: null, location: null };
const prediction = { id: 'p1', riskType: 'HEAT_ICE_ICE', riskLevel: 'HIGH', probability: 0.76, confidence: 0.89, forecastHorizonHours: 72, factors: [], dataSource: 'DEMO', modelType: 'RULE', createdAt: new Date().toISOString() };

describe('Staff farm detail', () => {
  beforeEach(() => {
    farmApi.get.mockResolvedValue({ farm });
    farmApi.risks.mockResolvedValue({ predictions: [prediction], nextAction: null, modelStatus: { label: 'Rule-based baseline' }, calculatedAt: prediction.createdAt });
    farmApi.runRisks.mockResolvedValue({});
    farmApi.notes.mockResolvedValue({ notes: [] });
    farmApi.addNote.mockResolvedValue({ note: { id: 'n1' } });
  });

  it('extension officers can flag predictions and recalculate risk', async () => {
    roles = ['EXTENSION_OFFICER'];
    renderPage(<StaffFarmDetail />, { route: '/extension/farms/f1?tab=risk', path: '/extension/farms/:id' });
    expect(await screen.findByText('Heat / Ice-Ice')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Flag prediction' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Recalculate risk' }));
    await waitFor(() => expect(farmApi.runRisks).toHaveBeenCalledWith('f1'));
  });

  it('cooperative admins cannot flag but can add an extension note', async () => {
    roles = ['COOPERATIVE_ADMIN'];
    renderPage(<StaffFarmDetail />, { route: '/cooperative/farms/f1?tab=risk', path: '/cooperative/farms/:id' });
    expect(await screen.findByText('Heat / Ice-Ice')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Flag prediction' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Extension notes/ }));
    await userEvent.type(await screen.findByLabelText(/^Note/), 'Called the farmer');
    await userEvent.selectOptions(screen.getByLabelText(/Visit priority/), 'HIGH');
    await userEvent.click(screen.getByRole('button', { name: 'Save note' }));
    await waitFor(() => expect(farmApi.addNote).toHaveBeenCalledWith('f1', { note: 'Called the farmer', visitPriority: 'HIGH', visitBy: null }));
    expect(await screen.findByText('Note saved.')).toBeInTheDocument();
  });
});
