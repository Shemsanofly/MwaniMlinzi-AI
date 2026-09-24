import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../../../i18n/I18nProvider.jsx';
import { channelApi } from '../../../api/endpoints.js';
import Ussd from '../Ussd.jsx';

vi.mock('../../../api/endpoints.js', () => ({ channelApi: { ussd: vi.fn() } }));
vi.mock('../../../stores/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { id: 'u', roles: ['ADMIN'], phone: null } }),
}));

const press = (k) => userEvent.click(screen.getByRole('button', { name: `Key ${k}` }));
const send = () => userEvent.click(screen.getByRole('button', { name: 'Send' }));

beforeEach(() => {
  localStorage.setItem('mwanimlinzi.lang', 'en');
  channelApi.ussd.mockReset();
});

test('dials *123# and sends the *-joined input path on each step', async () => {
  channelApi.ussd
    .mockResolvedValueOnce({ response: 'CON MwaniMlinzi\n1. Angalia Hatari\n2. Ripoti Dalili', end: false, state: 'MAIN', provider: 'simulated-ussd', simulated: true })
    .mockResolvedValueOnce({ response: 'CON Chagua shamba:\n1. FARM001', end: false, state: 'PICK_FARM', provider: 'simulated-ussd', simulated: true })
    .mockResolvedValueOnce({ response: 'CON Hali ya mwani?\n1. Nzuri', end: false, state: 'REPORT_1', provider: 'simulated-ussd', simulated: true })
    .mockResolvedValueOnce({ response: 'END Asante, ripoti imepokelewa.', end: true, state: 'REPORT_DONE', provider: 'simulated-ussd', simulated: true });

  render(<MemoryRouter><I18nProvider><Ussd /></I18nProvider></MemoryRouter>);
  expect(screen.getByLabelText(/Phone number/)).toHaveValue('+255777000001');

  for (const k of ['*', '1', '2', '3', '#']) await press(k);
  await send();
  await waitFor(() => expect(channelApi.ussd).toHaveBeenCalledTimes(1));
  const [sid, phone, text] = channelApi.ussd.mock.calls[0];
  expect(sid).toMatch(/^sim-/);
  expect(phone).toBe('+255777000001');
  expect(text).toBe('');
  // CON prefix is stripped on screen.
  await waitFor(() => expect(screen.getByTestId('ussd-screen')).toHaveTextContent('1. Angalia Hatari'));
  expect(screen.getByTestId('ussd-screen')).not.toHaveTextContent('CON');

  await press('2');
  await send();
  await waitFor(() => expect(channelApi.ussd).toHaveBeenCalledTimes(2));
  expect(channelApi.ussd.mock.calls[1]).toEqual([sid, '+255777000001', '2']);

  // Typing with the keyboard works too.
  await userEvent.type(await screen.findByLabelText('Phone input'), '1{Enter}');
  await waitFor(() => expect(channelApi.ussd).toHaveBeenCalledTimes(3));
  expect(channelApi.ussd.mock.calls[2]).toEqual([sid, '+255777000001', '2*1']);

  await press('1');
  await send();
  await waitFor(() => expect(channelApi.ussd).toHaveBeenCalledTimes(4));
  expect(channelApi.ussd.mock.calls[3][2]).toBe('2*1*1');
  await waitFor(() => expect(screen.getByTestId('ussd-screen')).toHaveTextContent('Asante, ripoti imepokelewa.'));
  expect(screen.getByTestId('ussd-screen')).not.toHaveTextContent('END');
  expect(screen.getByText(/Session ended/)).toBeInTheDocument();

  // OK restarts; a new dial gets a new session id.
  await userEvent.click(screen.getByRole('button', { name: 'Send' }));
  for (const k of ['*', '1', '2', '3', '#']) await press(k);
  channelApi.ussd.mockResolvedValueOnce({ response: 'CON MwaniMlinzi', end: false, state: 'MAIN', provider: 'simulated-ussd', simulated: true });
  await send();
  await waitFor(() => expect(channelApi.ussd).toHaveBeenCalledTimes(5));
  expect(channelApi.ussd.mock.calls[4][0]).not.toBe(sid);
  expect(channelApi.ussd.mock.calls[4][2]).toBe('');
});

test('does not call the backend for an unknown service code', async () => {
  render(<MemoryRouter><I18nProvider><Ussd /></I18nProvider></MemoryRouter>);
  for (const k of ['*', '9', '#']) await press(k);
  await send();
  expect(await screen.findByText(/Unknown USSD code/)).toBeInTheDocument();
  expect(channelApi.ussd).not.toHaveBeenCalled();
});
