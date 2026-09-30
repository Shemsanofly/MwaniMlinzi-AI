import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3, Bell, BookOpen, ClipboardCheck, Compass, Cpu, FlaskConical, Home, LogOut, Map, Menu,
  Settings, ShieldCheck, Sprout, UserCog, Users, X,
} from 'lucide-react';
import { useAuth } from '../stores/AuthContext.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import Logo from './Logo.jsx';
import LanguageSwitch from './LanguageSwitch.jsx';
import NotificationBell from './NotificationBell.jsx';
import OfflineBanner from './OfflineBanner.jsx';
import { cx } from '../components/ui/index.jsx';

/** Staff navigation per role, grouped so each sidebar stays short: MAIN (daily work), INSIGHTS, SYSTEM. */
export const NAV = {
  ADMIN: [
    { group: 'main', items: [
      { to: '/admin/dashboard', key: 'dashboard', icon: Home },
      { to: '/admin/users', key: 'users', icon: Users },
    ] },
    { group: 'field', items: [
      { to: '/admin/field', key: 'fieldOverview', icon: Compass },
      { to: '/admin/farms', key: 'farms', icon: Sprout },
      { to: '/admin/risk-map', key: 'riskMap', icon: Map },
      { to: '/admin/reviews', key: 'reviews', icon: ClipboardCheck },
      { to: '/admin/alerts', key: 'alerts', icon: Bell },
      { to: '/admin/forecast', key: 'forecast', icon: BarChart3 },
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
// What-if tool: re-runs the risk pipeline with adjusted conditions (never saved as real records).
const TOOLS_NAV = [
  { to: '/tools/scenarios', key: 'whatIf', icon: FlaskConical },
];

const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '·';

function NavItems({ items, onNavigate }) {
  const { t } = useI18n();
  return items.map(({ to, key, icon: Icon }) => (
    <NavLink
      key={to}
      to={to}
      onClick={onNavigate}
      className={({ isActive }) => cx(
        'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lagoon-300/60',
        isActive ? 'bg-white/10 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]' : 'text-ocean-200 hover:bg-white/5 hover:text-white',
      )}
    >
      {({ isActive }) => (
        <>
          <span className={cx('absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-lagoon-400 transition-all duration-300', isActive ? 'opacity-100' : 'scale-y-0 opacity-0')} aria-hidden />
          <Icon className={cx('h-[18px] w-[18px] shrink-0 transition-transform duration-300 group-hover:scale-110', isActive && 'text-lagoon-300')} aria-hidden />
          {t(`nav.${key}`)}
        </>
      )}
    </NavLink>
  ));
}

function NavGroup({ title, children }) {
  return (
    <div className="mb-4">
      {title && <p className="px-3 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-ocean-400">{title}</p>}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

/** Staff layout (admin): sidebar on desktop, drawer on mobile. */
export default function AppLayout() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const roles = user?.roles || [];
  const sections = ['ADMIN'].filter((r) => roles.includes(r));
  const close = () => setOpen(false);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const sidebar = (
    <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3 pt-2" aria-label={t('a11y.mainNav')}>
      {sections.map((role) => (
        <div key={role}>
          {sections.length > 1 && <p className="px-3 pb-2 pt-1 text-xs font-bold text-white/90">{t(`roles.${role}`)}</p>}
          {NAV[role].map(({ group, items }) => (
            <NavGroup key={group} title={t(`nav.groups.${group}`)}><NavItems items={items} onNavigate={close} /></NavGroup>
          ))}
        </div>
      ))}
      {roles.includes('ADMIN') && <NavGroup title={t('nav.groups.tools')}><NavItems items={TOOLS_NAV} onNavigate={close} /></NavGroup>}
      <NavGroup title={t('nav.groups.account')}><NavItems items={ACCOUNT_NAV} onNavigate={close} /></NavGroup>
      <div className="mt-auto flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-lagoon-300 to-ocean-400 text-sm font-extrabold text-ocean-950">{initials(user?.fullName)}</span>
        <div className="min-w-0 text-xs">
          <p className="truncate text-sm font-semibold text-white">{user?.fullName}</p>
          <p className="truncate text-ocean-300">{roles.map((r) => t(`roles.${r}`)).join(', ')}</p>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <OfflineBanner />
      <div className="flex flex-1">
        <aside className="ocean-band hidden w-[17rem] shrink-0 lg:block">
          <div className="sticky top-0 flex h-screen flex-col">
            <div className="flex h-16 shrink-0 items-center px-5"><Logo light to="/" /></div>
            {sidebar}
          </div>
        </aside>
        {open && (
          <div className="fixed inset-0 z-[1200] flex lg:hidden" role="dialog" aria-modal="true" aria-label={t('a11y.mainNav')}>
            <div className="ocean-band flex w-72 max-w-[85vw] animate-[drawer_0.35s_var(--ease-out-soft)_both] flex-col shadow-[var(--shadow-float)]">
              <div className="flex h-16 items-center justify-between px-4"><Logo light /><button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-white transition hover:rotate-90 hover:bg-white/10" aria-label={t('a11y.closeMenu')}><X /></button></div>
              {sidebar}
            </div>
            <button type="button" className="flex-1 animate-fade bg-ocean-950/50 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-label={t('a11y.closeMenu')} />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-[900] flex h-16 min-w-0 items-center gap-2 border-b border-slate-200/70 bg-sand-50/80 px-3 backdrop-blur-xl sm:gap-3 sm:px-6">
            <button type="button" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label={t('a11y.openMenu')}><Menu /></button>
            <div className="min-w-0 lg:hidden"><Logo compact iconOnlyOnPhone /></div>
            <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
              <LanguageSwitch />
              <NotificationBell />
              <button type="button" onClick={async () => { navigate('/login', { replace: true }); await logout(); }} className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-900/5 hover:text-slate-900">
                <LogOut className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">{t('actions.logout')}</span>
              </button>
            </div>
          </header>
          <main key={pathname} className="mx-auto w-full max-w-7xl flex-1 animate-rise px-4 py-6 sm:px-6 sm:py-8"><Outlet /></main>
        </div>
      </div>
    </div>
  );
}
