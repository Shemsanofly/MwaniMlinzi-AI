import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider, useI18n } from '../../i18n/I18nProvider.jsx';
import { authApi } from '../../api/endpoints.js';
import LanguageSwitch from '../LanguageSwitch.jsx';

vi.mock('../../api/endpoints.js', () => ({ authApi: { updateMe: vi.fn() } }));
const auth = { isAuthenticated: true, refresh: vi.fn() };
vi.mock('../../stores/AuthContext.jsx', () => ({ useAuth: () => auth }));

function Probe() {
  const { t } = useI18n();
  return <p data-testid="probe">{t('risk.levelLong.HIGH')}</p>;
}

beforeEach(() => {
  localStorage.setItem('mwanimlinzi.lang', 'sw');
  authApi.updateMe.mockReset().mockResolvedValue({ user: {} });
  auth.isAuthenticated = true;
});

test('shows [English | Kiswahili], switches the whole UI and saves to localStorage and the profile', async () => {
  const user = userEvent.setup();
  render(<I18nProvider><LanguageSwitch /><Probe /></I18nProvider>);
  expect(screen.getByTestId('probe')).toHaveTextContent('Hatari kubwa');
  expect(screen.getByRole('button', { name: /Kiswahili|SW/ })).toHaveAttribute('aria-pressed', 'true');
  await user.click(screen.getByRole('button', { name: /English|EN/ }));
  expect(screen.getByTestId('probe')).toHaveTextContent('High risk');
  expect(localStorage.getItem('mwanimlinzi.lang')).toBe('en');
  expect(document.documentElement.lang).toBe('en');
  expect(authApi.updateMe).toHaveBeenCalledWith({ preferredLanguage: 'en' });
});

test('does not call the API when logged out', async () => {
  auth.isAuthenticated = false;
  const user = userEvent.setup();
  render(<I18nProvider><LanguageSwitch /></I18nProvider>);
  await user.click(screen.getByRole('button', { name: /English|EN/ }));
  expect(localStorage.getItem('mwanimlinzi.lang')).toBe('en');
  expect(authApi.updateMe).not.toHaveBeenCalled();
});
