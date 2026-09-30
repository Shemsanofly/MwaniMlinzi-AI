import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../../../i18n/I18nProvider.jsx';
import Login from '../Login.jsx';

const auth = { login: vi.fn() };
vi.mock('../../../stores/AuthContext.jsx', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => auth,
}));

function renderAt(entry) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
    <MemoryRouter initialEntries={[entry]}>
      <I18nProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/farmer/dashboard" element={<p>FARMER HOME</p>} />
          <Route path="/admin/users" element={<p>ADMIN USERS</p>} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Login page', () => {
  beforeEach(() => {
    localStorage.setItem('mwanimlinzi.lang', 'en');
    auth.login.mockReset();
  });

  test('the eye icon shows and hides the typed password', async () => {
    renderAt('/login');
    const pw = screen.getByLabelText(/Password/);
    await userEvent.type(pw, 'Secret123');
    expect(pw).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(pw).toHaveAttribute('type', 'text');
    await userEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(pw).toHaveAttribute('type', 'password');
    expect(auth.login).not.toHaveBeenCalled();
  });

  test('logs in with a phone number', async () => {
    auth.login.mockResolvedValue({ id: 'u0', primaryRole: 'FARMER' });
    renderAt('/login');
    await userEvent.type(screen.getByLabelText(/Phone number or email/), '0777 000 001');
    await userEvent.type(screen.getByLabelText(/Password/), 'Secret123');
    await userEvent.click(screen.getByRole('button', { name: /Log in/ }));
    expect(auth.login).toHaveBeenCalledWith('0777 000 001', 'Secret123');
    expect(await screen.findByText('FARMER HOME')).toBeInTheDocument();
  });

  test('prefills the email from ?email=, submits and navigates to the home of the user role', async () => {
    auth.login.mockResolvedValue({ id: 'u1', primaryRole: 'FARMER' });
    renderAt('/login?email=farmer%40example.com');
    const email = screen.getByLabelText(/Phone number or email/);
    expect(email).toHaveValue('farmer@example.com');
    await userEvent.type(screen.getByLabelText(/Password/), 'Secret123');
    await userEvent.click(screen.getByRole('button', { name: /Log in/ }));
    expect(auth.login).toHaveBeenCalledWith('farmer@example.com', 'Secret123');
    expect(await screen.findByText('FARMER HOME')).toBeInTheDocument();
  });

  test('returns to the protected page the user came from', async () => {
    auth.login.mockResolvedValue({ id: 'u2', primaryRole: 'ADMIN' });
    renderAt({ pathname: '/login', state: { from: '/admin/users', email: 'admin@example.com' } });
    await userEvent.type(screen.getByLabelText(/Password/), 'Secret123');
    await userEvent.click(screen.getByRole('button', { name: /Log in/ }));
    expect(await screen.findByText('ADMIN USERS')).toBeInTheDocument();
  });

  test('shows a translated error and stays on the page', async () => {
    auth.login.mockRejectedValue(Object.assign(new Error('Incorrect phone/email or password'), { status: 401, code: 'INVALID_CREDENTIALS' }));
    renderAt('/login');
    await userEvent.type(screen.getByLabelText(/Phone number or email/), '0777000001');
    await userEvent.type(screen.getByLabelText(/Password/), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /Log in/ }));
    expect(await screen.findByText('Wrong phone/email or password.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /Log in/ })).toBeEnabled());
  });
});
