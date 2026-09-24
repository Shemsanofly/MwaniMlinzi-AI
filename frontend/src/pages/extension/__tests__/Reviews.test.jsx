import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderPage } from './testUtils.jsx';
import ExtensionReviews from '../Reviews.jsx';
import { extensionApi, riskApi } from '../../../api/endpoints.js';

vi.mock('../../../api/endpoints.js', () => ({
  extensionApi: { observations: vi.fn(), recommendations: vi.fn(), reviewObservation: vi.fn(), reviewRecommendation: vi.fn() },
  riskApi: { flag: vi.fn() },
  uploadApi: { imageUrl: vi.fn() },
}));

const obs = {
  id: 'obs1', farmId: 'f1', observedAt: new Date().toISOString(), cropCondition: 'POOR', whitening: true, breakage: false, epiphytes: false,
  diseaseSymptoms: true, unusualGrowth: false, percentAffected: 30, notes: 'White tips on many lines', reviewStatus: 'PENDING',
  farm: { id: 'f1', farmCode: 'FARM001', name: 'Paje Kusini' }, reporter: { fullName: 'Mwanaisha Haji' }, image: null,
};
const rec = {
  id: 'rec1', farmId: 'f1', status: 'PENDING', reviewStatus: 'PENDING', createdAt: new Date().toISOString(),
  farm: { id: 'f1', farmCode: 'FARM001', name: 'Paje Kusini' },
  prediction: { id: 'p1', riskType: 'HEAT_ICE_ICE', riskLevel: 'CRITICAL', probability: 0.965, explanation: 'SST is +1.5°C above normal', flagged: false },
  actionLibrary: { code: 'HEAT_CRITICAL_ESCALATE', action: 'Escalate to an extension officer', actionSw: 'Wasiliana na afisa ugani', urgency: 'IMMEDIATE', validated: false },
};

describe('Extension reviews', () => {
  beforeEach(() => {
    extensionApi.observations.mockResolvedValue({ observations: [obs] });
    extensionApi.recommendations.mockResolvedValue({ recommendations: [rec] });
    extensionApi.reviewObservation.mockResolvedValue({ observation: { ...obs, reviewStatus: 'REVIEWED' } });
    riskApi.flag.mockResolvedValue({ prediction: { id: 'p1', flagged: true } });
  });

  it('reviews an observation with a note', async () => {
    renderPage(<ExtensionReviews />);
    expect(await screen.findByText('White tips on many lines', { exact: false })).toBeInTheDocument();
    expect(extensionApi.observations).toHaveBeenCalledWith({ reviewStatus: 'PENDING' });
    expect(screen.getByText('Whitening')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Review' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/Note/), 'Visited, confirmed ice-ice');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark reviewed' }));
    await waitFor(() => expect(extensionApi.reviewObservation).toHaveBeenCalledWith('obs1', 'REVIEWED', 'Visited, confirmed ice-ice'));
    expect(await screen.findByText('Review saved.')).toBeInTheDocument();
  });

  it('flags a prediction from the recommendations tab', async () => {
    renderPage(<ExtensionReviews />, { route: '/extension/reviews?tab=recommendations' });
    expect(await screen.findByText('Escalate to an extension officer')).toBeInTheDocument();
    expect(screen.getByText('Pending local expert validation')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Flag prediction' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText(/Feedback type/), 'FALSE_POSITIVE');
    await userEvent.type(within(dialog).getByLabelText(/Reason/), 'Water was cool at the site');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send feedback' }));
    await waitFor(() => expect(riskApi.flag).toHaveBeenCalledWith('p1', { reason: 'Water was cool at the site', feedbackType: 'FALSE_POSITIVE' }));
  });
});
