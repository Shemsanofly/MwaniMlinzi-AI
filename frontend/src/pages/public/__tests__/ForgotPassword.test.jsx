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
describe('Forgot password by email', () => {
  beforeEach(() => { authApi.forgotPassword.mockReset(); authApi.resetPassword.mockReset(); });
  test('registered email, emailed code, new password, success', async () => {
    authApi.forgotPassword.mockResolvedValue({});
    authApi.resetPassword.mockResolvedValue({});
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Send code by email' }));
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(authApi.forgotPassword).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText(/Email/), 'Farmer@Example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send code by email' }));
    expect(authApi.forgotPassword).toHaveBeenCalledWith('farmer@example.com');
    expect(await screen.findByText(/a 6-digit code has been sent by email/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/6-digit code/), '12a3456');
    await userEvent.type(screen.getByLabelText(/New password/), 'Newpass123');
    await userEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(authApi.resetPassword).toHaveBeenCalledWith({ email: 'farmer@example.com', code: '123456', newPassword: 'Newpass123' });
    expect(await screen.findByText('Password changed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
  });
  test('shows unavailable email delivery in Kiswahili without showing a sent notice', async () => {
    authApi.forgotPassword.mockRejectedValue({ status: 503, code: 'EMAIL_NOT_CONFIGURED' });
    renderPage('sw');
    await userEvent.type(screen.getByLabelText(/Barua pepe/), 'farmer@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Tuma namba kwa barua pepe' }));
    expect(await screen.findByText('Huduma ya kurejesha nenosiri kwa barua pepe haipatikani. Wasiliana na msimamizi.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/tarakimu 6/)).not.toBeInTheDocument();
  });
  test('resend lets the user correct the email and keeps reset failures visible', async () => {
    authApi.forgotPassword.mockResolvedValue({});
    authApi.resetPassword.mockRejectedValue({ status: 400, code: 'INVALID_CODE' });
    renderPage();
    await userEvent.type(screen.getByLabelText(/Email/), 'farmer@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send code by email' }));
    await userEvent.type(await screen.findByLabelText(/6-digit code/), '123456');
    await userEvent.type(screen.getByLabelText(/New password/), 'Newpass123');
    await userEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(await screen.findByText('The code is wrong or has expired. Request a new code.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Did not get the email? Send a new code' }));
    expect(screen.getByLabelText(/Email/)).toHaveValue('farmer@example.com');
    expect(screen.queryByText('The code is wrong or has expired. Request a new code.')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send code by email' }));
    expect(authApi.forgotPassword).toHaveBeenCalledTimes(2);
  });
});
