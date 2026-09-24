import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../../../i18n/I18nProvider.jsx';
import { adminApi } from '../../../api/endpoints.js';
import AdminSettings from '../Settings.jsx';
import { thresholdError } from '../components/thresholds.js';

vi.mock('../../../api/endpoints.js', () => ({ adminApi: { settings: vi.fn(), updateSetting: vi.fn(), africasTalking: vi.fn(), testSms: vi.fn() } }));

const settings = {
  settings: [
    { key: 'risk.thresholds', value: { HIGH: 0.6, MEDIUM: 0.3, CRITICAL: 0.8 }, default: { MEDIUM: 0.3, HIGH: 0.6, CRITICAL: 0.8 }, description: 'Probability lower bounds', updatedAt: null },
    { key: 'ai.mode', value: 'HYBRID', default: 'HYBRID', description: 'mode', updatedAt: null },
  ],
  system: { demoMode: true, jobsEnabled: false, providers: { weather: { live: null, demo: 'demo-weather' }, ocean: { live: null, demo: 'demo-ocean' }, llm: 'template', sms: 'NOT_CONFIGURED', ussd: 'NOT_CONFIGURED' }, note: 'Secrets live in backend/.env' },
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><I18nProvider><AdminSettings /></I18nProvider></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  localStorage.setItem('mwanimlinzi.lang', 'en');
  adminApi.settings.mockResolvedValue(settings);
  adminApi.updateSetting.mockReset().mockResolvedValue({ setting: {} });
  adminApi.africasTalking.mockResolvedValue({
    environment: 'SANDBOX', username: 'sandbox', apiKeySet: false, senderIdSet: false, sms: 'NOT_CONFIGURED', ussd: 'CONFIGURED', ussdServiceCode: '*384*1234#',
    callbackSecretSet: true, connection: 'NOT_CONFIGURED', lastSendAt: null, lastError: null, smsLast7Days: {},
    callbackUrls: { ussd: 'https://api.example.org/api/integrations/africastalking/ussd?secret=<AT_CALLBACK_SECRET>' },
  });
  adminApi.testSms.mockReset().mockResolvedValue({ status: 'NOT_CONFIGURED', to: '+2557****0001', reason: "Africa's Talking is not configured" });
});

describe("Africa's Talking panel", () => {
  test('shows honest status and the real Test SMS result', async () => {
    const user = userEvent.setup();
    renderPage();
    const card = await screen.findByTestId('at-card');
    expect(await within(card).findByText('Environment: SANDBOX')).toBeInTheDocument();
    expect(within(card).getAllByText('Not configured').length).toBeGreaterThan(0);
    expect(within(card).getByText('*384*1234#')).toBeInTheDocument();
    await user.type(within(card).getByLabelText(/Test SMS to/), '12');
    await user.click(within(card).getByRole('button', { name: /Send test SMS/ }));
    expect(adminApi.testSms).not.toHaveBeenCalled();
    expect(within(card).getByText(/valid Tanzanian mobile number/)).toBeInTheDocument();
    await user.clear(within(card).getByLabelText(/Test SMS to/));
    await user.type(within(card).getByLabelText(/Test SMS to/), '0777 000 001');
    await user.click(within(card).getByRole('button', { name: /Send test SMS/ }));
    await waitFor(() => expect(adminApi.testSms).toHaveBeenCalledWith('+255777000001'));
    expect(await within(card).findByRole('status')).toHaveTextContent(/Not sent: Africa's Talking is not configured/);
  });
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
