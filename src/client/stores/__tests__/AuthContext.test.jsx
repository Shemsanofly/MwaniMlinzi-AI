import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AuthProvider, useAuth } from '../AuthContext.jsx';
import { authApi } from '../../api/endpoints.js';
import { tokenStore } from '../../api/client.js';
import { I18nProvider } from '../../i18n/I18nProvider.jsx';

vi.mock('../../api/endpoints.js', () => ({ authApi: { login: vi.fn(), register: vi.fn(), me: vi.fn(), logout: vi.fn() } }));

const user = { id: 'new-farmer', primaryRole: 'FARMER', roles: ['FARMER'], preferredLanguage: 'en' };
const session = { token: 'new-session-token', user };
const temporary = Object.assign(new Error('Connection unavailable'), { code: 'NETWORK_ERROR', status: 0 });

beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  authApi.login.mockResolvedValue(session);
  authApi.register.mockResolvedValue(session);
});

function renderAuth() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>
      <I18nProvider><AuthProvider>{children}</AuthProvider></I18nProvider>
    </QueryClientProvider>
  );
  return { ...renderHook(useAuth, { wrapper }), queryClient };
}

describe('session establishment during profile outages', () => {
  test.each(['login', 'register'])('%s remains authenticated when the following profile request fails', async (action) => {
    authApi.me.mockRejectedValue(temporary);
    const { result } = renderAuth();
    await act(async () => {
      if (action === 'login') await result.current.login('0777000001', 'test-password');
      else await result.current.register({ phone: '0777000001' });
    });
    expect(result.current.status).toBe('authenticated');
    expect(result.current.user).toEqual(user);
    expect(tokenStore.get()).toBe(session.token);
    expect(JSON.parse(localStorage.getItem('mwanimlinzi.user')).user).toEqual(user);
  });

  test('switching accounts during an outage never restores the previous user or their farm data', async () => {
    const previous = { user: { ...user, id: 'previous-farmer' }, cooperative: { id: 'old-coop' }, memberships: [{ code: 'OLD' }] };
    tokenStore.set('previous-token');
    localStorage.setItem('mwanimlinzi.user', JSON.stringify(previous));
    authApi.me.mockResolvedValueOnce(previous).mockRejectedValueOnce(temporary);
    const { result, queryClient } = renderAuth();
    await waitFor(() => expect(result.current.user?.id).toBe('previous-farmer'));
    queryClient.setQueryData(['farms'], [{ id: 'private-old-farm' }]);
    localStorage.setItem('mwanimlinzi.cache', 'old-farm-data');
    await act(async () => { await result.current.login('0777000001', 'test-password'); });
    expect(result.current.user).toEqual(user);
    expect(result.current.cooperative).toBeNull();
    expect(result.current.memberships).toEqual([]);
    expect(queryClient.getQueryData(['farms'])).toBeUndefined();
    expect(localStorage.getItem('mwanimlinzi.cache')).toBeNull();
  });

  test('a successful profile response adds the current account memberships', async () => {
    const cooperative = { id: 'new-coop' };
    const memberships = [{ code: 'NEW' }];
    authApi.me.mockResolvedValue({ user, cooperative, memberships });
    const { result } = renderAuth();
    await act(async () => { await result.current.login('0777000001', 'test-password'); });
    expect(result.current.cooperative).toEqual(cooperative);
    expect(result.current.memberships).toEqual(memberships);
  });

  test.each([401, 403])('a profile rejection with status %i still clears the invalid session', async (status) => {
    authApi.me.mockRejectedValue(Object.assign(new Error('Session rejected'), { status }));
    const { result } = renderAuth();
    await act(async () => { await result.current.login('0777000001', 'test-password'); });
    expect(result.current.status).toBe('anonymous');
    expect(tokenStore.get()).toBeNull();
    expect(localStorage.getItem('mwanimlinzi.user')).toBeNull();
  });
});
