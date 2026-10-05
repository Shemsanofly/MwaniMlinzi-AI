import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from '../navigation.jsx';
import {
  BarChart3, Bell, BookOpen, ClipboardCheck, Cloud, Compass, Cpu, FlaskConical, Gauge, Home, Key, LogOut, Map, Menu,
  Settings, ShieldCheck, Sprout, UserCog, Users, X,
} from 'lucide-react';
import { useAuth } from '../stores/AuthContext.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import Logo from './Logo.jsx';
import LanguageSwitch from './LanguageSwitch.jsx';
import NotificationBell from './NotificationBell.jsx';
import OfflineBanner from './OfflineBanner.jsx';
import { cx } from '../components/ui/index.jsx';
import { useDialog } from '../hooks/useDialog.js';
import { useDesktop } from '../hooks/useMediaQuery.js';

/** Administrator navigation: daily work, field operations and system settings. */
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
      { to: '/admin/impact', key: 'impact', icon: Gauge },
    ] },
    { group: 'system', items: [
      { to: '/admin/settings', key: 'integrations', icon: Settings },
      { to: '/admin/actions', key: 'actionLibrary', icon: BookOpen },
      { to: '/admin/models', key: 'models', icon: Cpu },
      { to: '/admin/tma', key: 'tma', icon: Cloud },
      { to: '/admin/tokens', key: 'tokens', icon: Key },
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
        'group relative flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lagoon-300/60',
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
export default function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const desktop = useDesktop();
  useEffect(() => { if (desktop) setOpen(false); }, [desktop]);
  const roles = user?.roles || [];
  // Pick exactly one NAV section — ADMIN wins if present, else first operator seat the user holds.
  const PRIORITY = ['ADMIN'];
  const sections = PRIORITY.filter((r) => roles.includes(r)).slice(0, 1);
  const close = () => setOpen(false);
  const panel = useRef(null);
  useDialog(open, panel, close);

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
    <div className="app-shell flex min-w-0 flex-col">
      <OfflineBanner />
      <div className="flex min-w-0 flex-1">
        <aside className="ocean-band hidden w-[17rem] shrink-0 lg:block">
          <div className="safe-top sticky top-0 flex h-dvh flex-col">
            <div className="flex h-16 shrink-0 items-center px-5"><Logo light to="/" /></div>
            {sidebar}
          </div>
        </aside>
        {open && (
          <div className="fixed inset-0 z-[1200] flex lg:hidden" role="dialog" aria-modal="true" aria-label={t('a11y.mainNav')}>
            <div ref={panel} tabIndex={-1} className="safe-top ocean-band flex min-h-0 w-72 max-w-[85vw] animate-[drawer_0.35s_var(--ease-out-soft)_both] flex-col pb-[env(safe-area-inset-bottom)] shadow-[var(--shadow-float)] outline-none">
              <div className="flex h-16 shrink-0 items-center justify-between px-4"><Logo light /><button type="button" onClick={() => setOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-lg text-white transition hover:bg-white/10" aria-label={t('a11y.closeMenu')}><X /></button></div>
              {sidebar}
            </div>
            <button type="button" className="flex-1 animate-fade bg-ocean-950/50 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-label={t('a11y.closeMenu')} />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="safe-top sticky top-0 z-[900] border-b border-slate-200/70 bg-sand-50/80 backdrop-blur-xl">
            <div className="safe-page flex min-h-16 min-w-0 items-center gap-1 py-1 sm:gap-3">
              <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label={t('a11y.openMenu')}><Menu /></button>
              <div className="min-w-0 lg:hidden"><Logo compact iconOnlyOnPhone /></div>
              <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
                <LanguageSwitch />
                <NotificationBell />
                <button type="button" onClick={async () => { navigate('/login', { replace: true }); await logout(); }} className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-900/5 hover:text-slate-900">
                  <LogOut className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">{t('actions.logout')}</span>
                </button>
              </div>
            </div>
          </header>
          <main key={pathname} className="app-content safe-page mx-auto max-w-7xl flex-1 animate-rise py-6 sm:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
