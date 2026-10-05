import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, test, vi } from 'vitest';
import { AuthProvider, useAuth } from '../AuthContext.jsx';
import ProtectedRoute from '../../layouts/ProtectedRoute.jsx';
import { authApi } from '../../api/endpoints.js';
import { tokenStore } from '../../api/client.js';
import { I18nProvider } from '../../i18n/I18nProvider.jsx';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from '../../test/router.jsx';
import { __setDelay } from '../../test/nextNavigation.jsx';

vi.mock('../../api/endpoints.js', () => ({ authApi: { login: vi.fn(), register: vi.fn(), me: vi.fn(), logout: vi.fn() } }));

const farmer = { id: 'f1', primaryRole: 'FARMER', roles: ['FARMER'], preferredLanguage: 'en' };

beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  authApi.me.mockResolvedValue({ user: farmer, cooperative: null, memberships: [] });
  authApi.login.mockResolvedValue({ token: 't2', user: farmer });
  tokenStore.set('t1');
});

function Page() {
  const { logout, login } = useAuth();
  const navigate = useNavigate();
  return (
    <div>
      <p>page</p>
      <button onClick={async () => { navigate('/login', { replace: true }); await logout(); }}>logout</button>
      <button onClick={() => login('x', 'y')}>login</button>
    </div>
  );
}
function Login() { const l = useLocation(); return <p data-testid="login">{JSON.stringify(l.state)}</p>; }

test('explicit logout never leaves a "from" behind, even when the router transition is slower than logout', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/farmer/risk']}>
            <Routes>
              <Route path="/farmer/risk" element={<ProtectedRoute><Page /></ProtectedRoute>} />
              <Route path="/login" element={<Login />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </I18nProvider>
    </QueryClientProvider>,
  );
  await screen.findByText('page');
  __setDelay(30); // like a Next transition: replace('/login') completes after logout() has finished
  authApi.logout.mockRejectedValue(new Error('offline'));
  await userEvent.click(screen.getByText('logout'));
  await waitFor(() => expect(screen.getByTestId('login')).toBeInTheDocument());
  expect(screen.getByTestId('login')).toHaveTextContent('null');
  expect(sessionStorage.getItem('mwanimlinzi.navState')).toBeNull();
});
