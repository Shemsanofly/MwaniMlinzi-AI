import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { farmApi } from '../../../api/endpoints.js';
import { useFarmerFarm } from '../../../hooks/useFarmerFarm.js';
import RiskPage from '../Risk.jsx';
import { farmerFarm, prediction, renderPage, riskResult } from './fixtures.jsx';

vi.mock('../../../api/endpoints.js', () => ({ farmApi: { risks: vi.fn(), riskHistory: vi.fn(), addAction: vi.fn() } }));
vi.mock('../../../hooks/useFarmerFarm.js', () => ({ useFarmerFarm: vi.fn() }));

test('insufficient data never shows a low risk or an actionable recommendation, including details', async () => {
  useFarmerFarm.mockReturnValue(farmerFarm());
  const p = { ...prediction('HEAT_ICE_ICE', 'LOW', 0, true), insufficientData: true };
  farmApi.risks.mockResolvedValue({ ...riskResult(), predictions: [p] });
  const user = userEvent.setup();
  renderPage(<RiskPage />);
  const card = await screen.findByTestId('risk-HEAT_ICE_ICE');
  expect(card).not.toHaveTextContent('Low risk');
  expect(within(card).queryByRole('button', { name: 'I did this' })).not.toBeInTheDocument();
  expect(within(card).getByRole('link', { name: 'Record symptoms' })).toHaveAttribute('href', '/farmer/observations');
  await user.click(within(card).getByRole('button', { name: 'See details' }));
  expect(card).not.toHaveTextContent('Low');
  expect(card).not.toHaveTextContent('90%');
  expect(within(card).queryByRole('progressbar')).not.toBeInTheDocument();
  expect(card).not.toHaveTextContent('Inspect lines within 24 hours');
});
