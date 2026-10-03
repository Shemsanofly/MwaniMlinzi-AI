import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../../../i18n/I18nProvider.jsx';
import { authApi } from '../../../api/endpoints.js';
import ForgotPassword from '../ForgotPassword.jsx';

vi.mock('../../../api/endpoints.js', () => ({ authApi: { forgotPassword: vi.fn(), resetPassword: vi.fn() } }));

const renderPage = (lang = 'en') => {
  localStorage.setItem('mwanimlinzi.lang', lang);
  return render(<MemoryRouter><I18nProvider><ForgotPassword /></I18nProvider></MemoryRouter>);
};

describe('Forgot password', () => {
  beforeEach(() => { authApi.forgotPassword.mockReset(); authApi.resetPassword.mockReset(); });

  test('phone → SMS code → new password → success', async () => {
    authApi.forgotPassword.mockResolvedValue({});
    authApi.resetPassword.mockResolvedValue({});
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Send code by SMS' }));
    expect(screen.getByText(/valid Tanzanian mobile number/)).toBeInTheDocument();
    expect(authApi.forgotPassword).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/Phone number/), '0777 000 001');
    await userEvent.click(screen.getByRole('button', { name: 'Send code by SMS' }));
    expect(authApi.forgotPassword).toHaveBeenCalledWith('0777 000 001');
    expect(await screen.findByText(/a 6-digit code has been sent by SMS/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/6-digit code/), '12a3456');
    await userEvent.type(screen.getByLabelText(/New password/), 'Newpass123');
    await userEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(authApi.resetPassword).toHaveBeenCalledWith({ phone: '0777 000 001', code: '123456', newPassword: 'Newpass123' });
    expect(await screen.findByText('Password changed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
  });

  test('shows the honest "not configured" message in Kiswahili', async () => {
    authApi.forgotPassword.mockRejectedValue({ status: 503, code: 'NOT_CONFIGURED', message: 'SMS is not configured' });
    renderPage('sw');
    await userEvent.type(screen.getByLabelText(/Namba ya simu/), '0777000001');
    await userEvent.click(screen.getByRole('button', { name: 'Tuma namba kwa SMS' }));
    expect(await screen.findByText('Huduma hii bado haijawekwa.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/tarakimu 6/)).not.toBeInTheDocument();
  });
});
