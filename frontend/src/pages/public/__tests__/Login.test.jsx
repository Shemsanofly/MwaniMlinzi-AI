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

  test('prefills the email from ?email=, submits and navigates to the home of the user role', async () => {
    auth.login.mockResolvedValue({ id: 'u1', primaryRole: 'BUYER' });
    renderAt('/login?email=buyer%40demo.mwanimlinzi.local');
    const email = screen.getByLabelText(/Email/);
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

  test('shows the backend error message and stays on the page', async () => {
    auth.login.mockRejectedValue(Object.assign(new Error('Incorrect email or password'), { status: 401 }));
    renderAt('/login');
    await userEvent.type(screen.getByLabelText(/Email/), 'x@y.tz');
    await userEvent.type(screen.getByLabelText(/Password/), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /Log in/ }));
    expect(await screen.findByText('Incorrect email or password')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /Log in/ })).toBeEnabled());
  });
});
