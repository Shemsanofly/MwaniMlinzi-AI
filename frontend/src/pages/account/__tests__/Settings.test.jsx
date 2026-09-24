import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../../../i18n/I18nProvider.jsx';
import { authApi } from '../../../api/endpoints.js';
import AccountSettings from '../Settings.jsx';

vi.mock('../../../api/endpoints.js', () => ({ authApi: { updateMe: vi.fn(), changePassword: vi.fn() } }));
const user0 = { id: 'u1', fullName: 'Asha', phone: '+255777000001', email: null, preferredLanguage: 'en', smsEnabled: true, notifyRiskAlerts: true, notifyHarvest: true, notifySystem: true };
const auth = { user: user0, refresh: vi.fn().mockResolvedValue() };
vi.mock('../../../stores/AuthContext.jsx', () => ({ useAuth: () => auth }));

const renderPage = () => render(<MemoryRouter><I18nProvider><AccountSettings /></I18nProvider></MemoryRouter>);

beforeEach(() => {
  localStorage.setItem('mwanimlinzi.lang', 'en');
  authApi.updateMe.mockReset().mockResolvedValue({ user: user0 });
  authApi.changePassword.mockReset().mockResolvedValue({});
});

test('saves SMS preferences; sub-options are disabled when SMS is off', async () => {
  const u = userEvent.setup();
  renderPage();
  expect(screen.getByLabelText(/Phone number/)).toHaveValue('+255 777 000 001');
  await u.click(screen.getByLabelText(/Harvest reminders/));
  await u.click(screen.getByLabelText(/Send me SMS/));
  expect(screen.getByLabelText(/Risk alerts/)).toBeDisabled();
  await u.click(screen.getAllByRole('button', { name: 'Save' })[1]);
  await waitFor(() => expect(authApi.updateMe).toHaveBeenCalledWith({ smsEnabled: false, notifyRiskAlerts: true, notifyHarvest: false, notifySystem: true }));
  expect(await screen.findByRole('status')).toHaveTextContent('Saved');
});

test('language choice updates the UI and the profile', async () => {
  const u = userEvent.setup();
  renderPage();
  await u.click(screen.getByRole('radio', { name: 'Kiswahili' }));
  await waitFor(() => expect(authApi.updateMe).toHaveBeenCalledWith({ preferredLanguage: 'sw' }));
  expect(await screen.findByRole('heading', { name: 'Mipangilio' })).toBeInTheDocument();
});

test('phone is validated and normalised before saving', async () => {
  const u = userEvent.setup();
  renderPage();
  const phone = screen.getByLabelText(/Phone number/);
  await u.clear(phone);
  await u.type(phone, '123');
  await u.click(screen.getAllByRole('button', { name: 'Save' })[0]);
  expect(authApi.updateMe).not.toHaveBeenCalled();
  expect(screen.getByText(/valid Tanzanian mobile number/)).toBeInTheDocument();
  await u.clear(phone);
  await u.type(phone, '0655 123 456');
  await u.click(screen.getAllByRole('button', { name: 'Save' })[0]);
  await waitFor(() => expect(authApi.updateMe).toHaveBeenCalledWith({ phone: '+255655123456', email: null }));
});

test('password change checks the new password before calling the API', async () => {
  const u = userEvent.setup();
  renderPage();
  await u.type(screen.getByLabelText(/Current password/), 'OldPass1');
  await u.type(screen.getByLabelText(/^New password/), 'short');
  await u.type(screen.getByLabelText(/Confirm password/), 'short');
  await u.click(screen.getByRole('button', { name: /Change password/ }));
  expect(authApi.changePassword).not.toHaveBeenCalled();
  await u.clear(screen.getByLabelText(/^New password/));
  await u.clear(screen.getByLabelText(/Confirm password/));
  await u.type(screen.getByLabelText(/^New password/), 'NewPass12');
  await u.type(screen.getByLabelText(/Confirm password/), 'NewPass12');
  await u.click(screen.getByRole('button', { name: /Change password/ }));
  await waitFor(() => expect(authApi.changePassword).toHaveBeenCalledWith('OldPass1', 'NewPass12'));
});
