import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { aiApi, farmApi } from '../../../api/endpoints.js';
import { useFarmerFarm } from '../../../hooks/useFarmerFarm.js';
import AssistantPage from '../Assistant.jsx';
import { FARM, farmerFarm, renderPage, riskResult } from './fixtures.jsx';

vi.mock('../../../api/endpoints.js', () => ({
  aiApi: { chat: vi.fn() },
  farmApi: { addObservation: vi.fn(), addAction: vi.fn() },
}));
vi.mock('../../../hooks/useFarmerFarm.js', () => ({ useFarmerFarm: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  useFarmerFarm.mockReturnValue(farmerFarm());
});

describe('Farm assistant', () => {
  it('sends a suggested question and renders the reply, provenance and approved action', async () => {
    const user = userEvent.setup();
    aiApi.chat.mockResolvedValue({
      intent: 'WHAT_TO_DO', language: 'en', reply: 'Next action: Inspect lines within 24 hours', generatedBy: 'TEMPLATE',
      approvedAction: { text: 'Inspect lines within 24 hours', source: 'Demo rule set', validated: false, recommendationId: 'r1', riskType: 'HEAT_ICE_ICE' },
      observationDraft: null, facts: {}, farm: { id: FARM.id, farmCode: 'FARM001', name: FARM.name },
    });
    renderPage(<AssistantPage />);
    await user.click(screen.getByRole('button', { name: 'What should I do?' }));
    await waitFor(() => expect(aiApi.chat).toHaveBeenCalledWith('What should I do?', FARM.id, 'en'));
    expect(await screen.findByText('Next action: Inspect lines within 24 hours')).toBeInTheDocument();
    expect(screen.getByText('Approved action')).toBeInTheDocument();
    expect(screen.getByText('Pending local expert validation')).toBeInTheDocument();
    expect(screen.getByText('Answer from your farm records (FARM001)')).toBeInTheDocument();
    expect(screen.getByText('Template answer')).toBeInTheDocument();
  });

  it('confirms an observation draft and shows the resulting risk', async () => {
    const user = userEvent.setup();
    const draft = { cropCondition: 'FAIR', whitening: true, breakage: false, epiphytes: false, diseaseSymptoms: true, unusualGrowth: false, percentAffected: 20, notes: 'From assistant', confidence: 'MEDIUM' };
    aiApi.chat.mockResolvedValue({ intent: 'RECORD_OBSERVATION', language: 'en', reply: 'I understood: whitening (20%).', generatedBy: 'TEMPLATE', approvedAction: null, observationDraft: draft, facts: {}, farm: { id: FARM.id, farmCode: 'FARM001' } });
    farmApi.addObservation.mockResolvedValue({ observation: { id: 'o1' }, risk: { ...riskResult('CRITICAL', 0.95), alerts: [] } });
    renderPage(<AssistantPage />);
    await user.type(screen.getByLabelText('Your question'), 'I see whitening on 20% of my seaweed');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await user.click(await screen.findByRole('button', { name: 'Confirm & record' }));
    await waitFor(() => expect(farmApi.addObservation).toHaveBeenCalledWith(FARM.id, draft));
    expect(await screen.findByTestId('risk-tile-HEAT_ICE_ICE')).toHaveTextContent('95%');
  });
});
