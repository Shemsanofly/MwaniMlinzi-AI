import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '../api/endpoints.js';
import { setUnauthorizedHandler, tokenStore } from '../api/client.js';
import { useI18n } from '../i18n/I18nProvider.jsx';

const AuthContext = createContext(null);
const USER_KEY = 'mwanimlinzi.user';
const cachedUser = () => { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; } };
const saveUser = (u) => { try { localStorage.setItem(USER_KEY, JSON.stringify(u)); } catch { /* storage unavailable */ } };

export const HOME_FOR_ROLE = {
  FARMER: '/farmer/dashboard',
  COOPERATIVE_ADMIN: '/cooperative/dashboard',
  EXTENSION_OFFICER: '/extension/dashboard',
  BUYER: '/buyer/dashboard',
  ADMIN: '/admin/dashboard',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [extra, setExtra] = useState({ cooperative: null, memberships: [] });
  const [status, setStatus] = useState(tokenStore.get() ? 'loading' : 'anonymous');
  const queryClient = useQueryClient();
  const { setLang } = useI18n();

  const clear = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setStatus('anonymous');
    queryClient.clear();
    try { localStorage.removeItem('mwanimlinzi.cache'); localStorage.removeItem(USER_KEY); } catch { /* storage unavailable */ }
  }, [queryClient]);

  const loadMe = useCallback(async () => {
    try {
      const data = await authApi.me();
      setUser(data.user);
      saveUser({ user: data.user, cooperative: data.cooperative, memberships: data.memberships || [] });
      setExtra({ cooperative: data.cooperative, memberships: data.memberships || [] });
      setStatus('authenticated');
    } catch (err) {
      // Only an invalid/expired session logs the user out. With no connection (or a server error)
      // the last known profile is kept so saved farm information stays usable offline.
      const cached = cachedUser();
      if (err?.status !== 401 && err?.status !== 403 && cached?.user) {
        setUser((u) => u || cached.user);
        setExtra((x) => (x.memberships.length || x.cooperative ? x : { cooperative: cached.cooperative, memberships: cached.memberships || [] }));
        setStatus('authenticated');
        return;
      }
      clear();
    }
  }, [clear]);

  useEffect(() => {
    setUnauthorizedHandler(clear);
    if (tokenStore.get()) loadMe();
  }, [clear, loadMe]);

  const login = useCallback(async (identifier, password) => {
    const data = await authApi.login(identifier, password);
    tokenStore.set(data.token);
    if (data.user.preferredLanguage) setLang(data.user.preferredLanguage);
    await loadMe();
    return data.user;
  }, [loadMe, setLang]);

  const register = useCallback(async (body) => {
    const data = await authApi.register(body);
    tokenStore.set(data.token);
    if (data.user.preferredLanguage) setLang(data.user.preferredLanguage);
    await loadMe();
    return data.user;
  }, [loadMe, setLang]);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch { /* token may already be invalid */ }
    clear();
  }, [clear]);

  const value = useMemo(() => ({
    user,
    status,
    cooperative: extra.cooperative,
    memberships: extra.memberships,
    isAuthenticated: status === 'authenticated',
    hasRole: (...roles) => !!user && user.roles.some((r) => roles.includes(r)),
    homePath: user ? HOME_FOR_ROLE[user.primaryRole] || '/' : '/login',
    login,
    register,
    logout,
    refresh: loadMe,
  }), [user, status, extra, login, register, logout, loadMe]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

 
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
