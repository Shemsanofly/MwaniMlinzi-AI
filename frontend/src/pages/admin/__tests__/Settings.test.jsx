import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../../../i18n/I18nProvider.jsx';
import { adminApi } from '../../../api/endpoints.js';
import AdminSettings from '../Settings.jsx';
import { thresholdError } from '../components/thresholds.js';

vi.mock('../../../api/endpoints.js', () => ({ adminApi: { settings: vi.fn(), updateSetting: vi.fn() } }));

const settings = {
  settings: [
    { key: 'risk.thresholds', value: { HIGH: 0.6, MEDIUM: 0.3, CRITICAL: 0.8 }, default: { MEDIUM: 0.3, HIGH: 0.6, CRITICAL: 0.8 }, description: 'Probability lower bounds', updatedAt: null },
    { key: 'ai.mode', value: 'HYBRID', default: 'HYBRID', description: 'mode', updatedAt: null },
  ],
  system: { demoMode: true, jobsEnabled: false, providers: { weather: { live: null, demo: 'demo-weather' }, ocean: { live: null, demo: 'demo-ocean' }, llm: 'template', sms: 'simulated-sms', ussd: 'simulated-ussd' }, note: 'Secrets live in backend/.env' },
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><I18nProvider><AdminSettings /></I18nProvider></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  localStorage.setItem('mwanimlinzi.lang', 'en');
  adminApi.settings.mockResolvedValue(settings);
  adminApi.updateSetting.mockReset().mockResolvedValue({ setting: {} });
});

test('thresholdError enforces 0 < MEDIUM < HIGH < CRITICAL < 1', () => {
  expect(thresholdError({ MEDIUM: 0.3, HIGH: 0.6, CRITICAL: 0.8 })).toBeNull();
  expect(thresholdError({ MEDIUM: 0.7, HIGH: 0.6, CRITICAL: 0.8 })).toBe('admin.settings.thresholdOrder');
  expect(thresholdError({ MEDIUM: 0.6, HIGH: 0.6, CRITICAL: 0.8 })).toBe('admin.settings.thresholdOrder');
  expect(thresholdError({ MEDIUM: 0.3, HIGH: 0.6, CRITICAL: 1 })).toBe('admin.settings.thresholdRange');
  expect(thresholdError({ MEDIUM: Number.NaN, HIGH: 0.6, CRITICAL: 0.8 })).toBe('admin.settings.thresholdNumber');
});

test('non-ascending thresholds cannot be saved; valid ones are sent to the backend', async () => {
  renderPage();
  const medium = await screen.findByLabelText(/Medium ≥/);
  const row = medium.closest('div.py-4');
  const save = within(row).getByRole('button', { name: /Save/ });
  expect(save).toBeDisabled(); // unchanged

  fireEvent.change(medium, { target: { value: '0.7' } });
  expect(within(row).getByRole('alert')).toHaveTextContent('Thresholds must be ascending');
  expect(save).toBeDisabled();
  await userEvent.click(save);
  expect(adminApi.updateSetting).not.toHaveBeenCalled();

  fireEvent.change(medium, { target: { value: '0.35' } });
  expect(within(row).queryByRole('alert')).not.toBeInTheDocument();
  expect(save).toBeEnabled();
  await userEvent.click(save);
  await waitFor(() => expect(adminApi.updateSetting).toHaveBeenCalledWith('risk.thresholds', { MEDIUM: 0.35, HIGH: 0.6, CRITICAL: 0.8 }));
});
