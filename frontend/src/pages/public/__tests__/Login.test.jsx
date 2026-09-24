import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { I18nProvider } from '../../../i18n/I18nProvider.jsx';
import Login from '../Login.jsx';

const auth = { login: vi.fn() };
vi.mock('../../../stores/AuthContext.jsx', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => auth,
}));

function renderAt(entry) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <I18nProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/buyer/dashboard" element={<p>BUYER HOME</p>} />
          <Route path="/admin/users" element={<p>ADMIN USERS</p>} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>,
  );
}

describe('Login page', () => {
  beforeEach(() => {
    localStorage.setItem('mwanimlinzi.lang', 'en');
    auth.login.mockReset();
  });

  test('logs in with a phone number', async () => {
    auth.login.mockResolvedValue({ id: 'u0', primaryRole: 'BUYER' });
    renderAt('/login');
    await userEvent.type(screen.getByLabelText(/Phone number or email/), '0777 000 001');
    await userEvent.type(screen.getByLabelText(/Password/), 'Secret123');
    await userEvent.click(screen.getByRole('button', { name: /Log in/ }));
    expect(auth.login).toHaveBeenCalledWith('0777 000 001', 'Secret123');
    expect(await screen.findByText('BUYER HOME')).toBeInTheDocument();
  });

  test('prefills the email from ?email=, submits and navigates to the home of the user role', async () => {
    auth.login.mockResolvedValue({ id: 'u1', primaryRole: 'BUYER' });
    renderAt('/login?email=buyer%40demo.mwanimlinzi.local');
    const email = screen.getByLabelText(/Phone number or email/);
    expect(email).toHaveValue('buyer@demo.mwanimlinzi.local');
    await userEvent.type(screen.getByLabelText(/Password/), 'Secret123');
    await userEvent.click(screen.getByRole('button', { name: /Log in/ }));
    expect(auth.login).toHaveBeenCalledWith('buyer@demo.mwanimlinzi.local', 'Secret123');
    expect(await screen.findByText('BUYER HOME')).toBeInTheDocument();
  });

  test('returns to the protected page the user came from', async () => {
    auth.login.mockResolvedValue({ id: 'u2', primaryRole: 'ADMIN' });
    renderAt({ pathname: '/login', state: { from: '/admin/users', email: 'admin@demo.mwanimlinzi.local' } });
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
