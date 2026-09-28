import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3, Bell, BookOpen, ClipboardCheck, Cpu, FlaskConical, Home, LogOut, Map, Menu,
  Settings, ShieldCheck, Sprout, Truck, UserCog, Users, X,
} from 'lucide-react';
import { useAuth } from '../stores/AuthContext.jsx';
import { metaApi } from '../api/endpoints.js';
import { useI18n } from '../i18n/I18nProvider.jsx';
import Logo from './Logo.jsx';
import LanguageSwitch from './LanguageSwitch.jsx';
import NotificationBell from './NotificationBell.jsx';
import DemoBanner from './DemoBanner.jsx';
import OfflineBanner from './OfflineBanner.jsx';
import { cx } from '../components/ui/index.jsx';

/** Staff navigation per role, grouped so each sidebar stays short: MAIN (daily work), INSIGHTS, SYSTEM. */
export const NAV = {
  COOPERATIVE_ADMIN: [
    { group: 'main', items: [
      { to: '/cooperative/dashboard', key: 'dashboard', icon: Home },
      { to: '/cooperative/farms', key: 'farms', icon: Sprout },
      { to: '/cooperative/alerts', key: 'alerts', icon: Bell },
    ] },
    { group: 'insights', items: [
      { to: '/cooperative/map', key: 'map', icon: Map },
      { to: '/cooperative/forecast', key: 'forecast', icon: BarChart3 },
    ] },
  ],
  EXTENSION_OFFICER: [
    { group: 'main', items: [
      { to: '/extension/dashboard', key: 'dashboard', icon: Home },
      { to: '/extension/farms', key: 'farms', icon: Sprout },
      { to: '/extension/reviews', key: 'reviews', icon: ClipboardCheck },
    ] },
    { group: 'insights', items: [
      { to: '/extension/risk-map', key: 'riskMap', icon: Map },
      { to: '/extension/actions', key: 'actionLibrary', icon: BookOpen },
    ] },
  ],
  BUYER: [
    { group: 'main', items: [
      { to: '/buyer/dashboard', key: 'dashboard', icon: Home },
      { to: '/buyer/supply', key: 'supply', icon: Truck },
    ] },
    { group: 'insights', items: [
      { to: '/buyer/forecast', key: 'forecast', icon: BarChart3 },
    ] },
  ],
  ADMIN: [
    { group: 'main', items: [
      { to: '/admin/dashboard', key: 'dashboard', icon: Home },
      { to: '/admin/users', key: 'users', icon: Users },
    ] },
    { group: 'system', items: [
      { to: '/admin/settings', key: 'integrations', icon: Settings },
      { to: '/admin/actions', key: 'actionLibrary', icon: BookOpen },
      { to: '/admin/models', key: 'models', icon: Cpu },
      { to: '/admin/audit', key: 'audit', icon: ShieldCheck },
    ] },
  ],
};

const ACCOUNT_NAV = [
  { to: '/account/notifications', key: 'notifications', icon: Bell },
  { to: '/account/settings', key: 'account', icon: UserCog },
];
// Scenario tool for training and demonstrations; only offered when the backend runs in demo mode.
const DEMO_NAV = [
  { to: '/demo/simulation', key: 'simulation', icon: FlaskConical },
];

function NavItems({ items, onNavigate }) {
  const { t } = useI18n();
  return items.map(({ to, key, icon: Icon }) => (
    <NavLink
      key={to}
      to={to}
      onClick={onNavigate}
      className={({ isActive }) => cx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300', isActive ? 'bg-ocean-700 text-white' : 'text-ocean-100 hover:bg-ocean-800 hover:text-white')}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
      {t(`nav.${key}`)}
    </NavLink>
  ));
}

function NavGroup({ title, children }) {
  return (
    <div className="mb-3">
      {title && <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-ocean-300">{title}</p>}
      {children}
    </div>
  );
}

/** Staff layout (cooperative, extension, buyer, admin): sidebar on desktop, drawer on mobile. */
export default function AppLayout() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const roles = user?.roles || [];
  const sections = ['ADMIN', 'COOPERATIVE_ADMIN', 'EXTENSION_OFFICER', 'BUYER'].filter((r) => roles.includes(r));
  const { data: health } = useQuery({ queryKey: ['health'], queryFn: metaApi.health, staleTime: 5 * 60_000, retry: false });
  const showDemo = health?.demoMode && !roles.every((r) => r === 'BUYER');
  const close = () => setOpen(false);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const sidebar = (
    <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3" aria-label={t('a11y.mainNav')}>
      {sections.map((role) => (
        <div key={role}>
          {sections.length > 1 && <p className="px-3 pb-1 pt-1 text-xs font-bold text-white">{t(`roles.${role}`)}</p>}
          {NAV[role].map(({ group, items }) => (
            <NavGroup key={group} title={t(`nav.groups.${group}`)}><NavItems items={items} onNavigate={close} /></NavGroup>
          ))}
        </div>
      ))}
      <NavGroup title={t('nav.groups.account')}><NavItems items={ACCOUNT_NAV} onNavigate={close} /></NavGroup>
      {showDemo && <NavGroup title={t('nav.groups.demo')}><NavItems items={DEMO_NAV} onNavigate={close} /></NavGroup>}
      <div className="mt-auto rounded-lg bg-ocean-800/60 p-3 text-xs text-ocean-100">
        <p className="font-semibold text-white">{user?.fullName}</p>
        <p className="truncate">{user?.phone || user?.email}</p>
        <p className="mt-0.5 text-ocean-300">{roles.map((r) => t(`roles.${r}`)).join(', ')}</p>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <OfflineBanner />
      <DemoBanner />
      <div className="flex flex-1">
        <aside className="hidden w-64 shrink-0 bg-ocean-900 lg:block">
          <div className="flex h-16 items-center px-5"><Logo light to="/" /></div>
          <div className="sticky top-0 flex h-[calc(100vh-4rem)] flex-col">{sidebar}</div>
        </aside>
        {open && (
          <div className="fixed inset-0 z-[1200] flex lg:hidden" role="dialog" aria-modal="true" aria-label={t('a11y.mainNav')}>
            <div className="flex w-72 max-w-[85vw] flex-col bg-ocean-900">
              <div className="flex h-16 items-center justify-between px-4"><Logo light /><button type="button" onClick={() => setOpen(false)} className="text-white" aria-label={t('a11y.closeMenu')}><X /></button></div>
              {sidebar}
            </div>
            <button type="button" className="flex-1 bg-slate-900/50" onClick={() => setOpen(false)} aria-label={t('a11y.closeMenu')} />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-[900] flex h-16 min-w-0 items-center gap-2 border-b border-slate-200 bg-white/95 px-3 backdrop-blur sm:gap-3 sm:px-6">
            <button type="button" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label={t('a11y.openMenu')}><Menu /></button>
            <div className="min-w-0 lg:hidden"><Logo compact iconOnlyOnPhone /></div>
            <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
              <LanguageSwitch />
              <NotificationBell />
              <button type="button" onClick={async () => { navigate('/login', { replace: true }); await logout(); }} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">
                <LogOut className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">{t('actions.logout')}</span>
              </button>
            </div>
          </header>
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6"><Outlet /></main>
        </div>
      </div>
    </div>
  );
}

