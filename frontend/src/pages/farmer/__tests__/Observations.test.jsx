import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { farmApi, uploadApi } from '../../../api/endpoints.js';
import { useFarmerFarm } from '../../../hooks/useFarmerFarm.js';
import ObservationsPage from '../Observations.jsx';
import { FARM, farmerFarm, renderPage, riskResult } from './fixtures.jsx';

vi.mock('../../../api/endpoints.js', () => ({
  farmApi: { risks: vi.fn(), addObservation: vi.fn(), observations: vi.fn(), addAction: vi.fn() },
  uploadApi: { image: vi.fn(), imageUrl: vi.fn() },
}));
vi.mock('../../../hooks/useFarmerFarm.js', () => ({ useFarmerFarm: vi.fn() }));

const IMAGE_ID = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  useFarmerFarm.mockReturnValue(farmerFarm());
  farmApi.risks.mockResolvedValue(riskResult('HIGH', 0.72));
  const fresh = { ...riskResult('CRITICAL', 0.93), alerts: [{ id: 'al9', severity: 'CRITICAL', title: 'CRITICAL heat risk — FARM001', titleSw: 'Hatari muhimu', message: 'Contact extension officer', messageSw: 'Wasiliana na afisa ugani' }] };
  farmApi.addObservation.mockResolvedValue({ observation: { id: 'o1' }, risk: fresh });
  uploadApi.image.mockResolvedValue({ file: { id: IMAGE_ID } });
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview');
  globalThis.URL.revokeObjectURL = vi.fn();
});

describe('Observation wizard', () => {
  it('walks through the steps, submits the right body and shows the updated risk', async () => {
    const user = userEvent.setup();
    renderPage(<ObservationsPage />);
    await waitFor(() => expect(farmApi.risks).toHaveBeenCalled());
    // Wait for the previous risk to load so the result can compare against it.
    await screen.findByText('Step 1 of 7');
    await waitFor(() => expect(farmApi.risks.mock.results[0]?.type).toBe('return'));

    expect(screen.getByText('How is the seaweed?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fair' }));
    expect(screen.getByText('Do you see white seaweed?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Yes' }));
    expect(screen.getByText('Are seaweed or lines breaking?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'No' }));
    // Back works, and the answer is kept.
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Are seaweed or lines breaking?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'No' }));
    expect(screen.getByText('Is the growth unusual?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'No' }));

    // Optional details
    await user.click(screen.getByRole('button', { name: /Add more details/ }));
    await user.click(screen.getByRole('button', { name: 'Muddy' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Photo: reject a wrong file type, then accept a PNG
    expect(screen.getByText('Add a photo')).toBeInTheDocument();
    const input = screen.getByLabelText('Take or choose a photo', { selector: 'input' });
    fireEvent.change(input, { target: { files: [new File(['x'], 'doc.gif', { type: 'image/gif' })] } });
    expect(screen.getByText('Only JPEG, PNG or WebP photos are allowed.')).toBeInTheDocument();
    fireEvent.change(input, { target: { files: [new File(['png'], 'farm.png', { type: 'image/png' })] } });
    expect(screen.getAllByAltText('Photo of the seaweed farm').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Review & submit
    expect(screen.getByText('Check and send')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send report' }));

    await waitFor(() => expect(uploadApi.image).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(farmApi.addObservation).toHaveBeenCalledWith(FARM.id, {
      cropCondition: 'FAIR', whitening: true, breakage: false, unusualGrowth: false, epiphytes: false, diseaseSymptoms: false,
      confidence: 'MEDIUM', waterAppearance: 'TURBID', imageFileId: IMAGE_ID,
    }));

    expect(await screen.findByText('Observation recorded')).toBeInTheDocument();
    expect(screen.getByTestId('risk-tile-HEAT_ICE_ICE')).toHaveTextContent('93%');
    expect(screen.getByTestId('risk-tile-HEAT_ICE_ICE')).toHaveTextContent('Critical');
    expect(screen.getByText('Heat / Ice-Ice: changed from High to Critical.')).toBeInTheDocument();
    expect(screen.getByText('CRITICAL heat risk — FARM001')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record another' })).toBeInTheDocument();
  });

  it('shows past observations with review status', async () => {
    const user = userEvent.setup();
    farmApi.observations.mockResolvedValue({ observations: [{ id: 'o1', cropCondition: 'POOR', whitening: true, breakage: false, reviewStatus: 'REVIEWED', reviewNote: 'Confirmed ice-ice', reviewedBy: { fullName: 'Officer Juma' }, observedAt: '2026-09-20T08:00:00.000Z', image: null }] });
    renderPage(<ObservationsPage />);
    await user.click(screen.getByRole('tab', { name: 'Past reports' }));
    expect(await screen.findByText('Reviewed')).toBeInTheDocument();
    expect(screen.getByText('Confirmed ice-ice')).toBeInTheDocument();
    expect(farmApi.observations).toHaveBeenCalledWith(FARM.id);
  });
});
