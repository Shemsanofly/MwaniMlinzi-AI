import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Activity, Bell, Bot, ClipboardList, History, Home, LogOut, MoreHorizontal, NotebookPen, Settings, Sprout, Truck, X } from 'lucide-react';
import { useAuth } from '../stores/AuthContext.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import Logo from './Logo.jsx';
import LanguageSwitch from './LanguageSwitch.jsx';
import OfflineBanner from './OfflineBanner.jsx';
import { useNotifications } from '../components/notifications.jsx';
import { cx } from '../components/ui/index.jsx';
import { useDialog } from '../hooks/useDialog.js';

/** Four everyday destinations; everything else lives under "More". */
const TABS = [
  { to: '/farmer/dashboard', key: 'dashboard', icon: Home },
  { to: '/farmer/risk', key: 'risk', icon: Activity },
  { to: '/farmer/observations', key: 'observations', icon: ClipboardList },
  { to: '/farmer/alerts', key: 'alerts', icon: Bell, badge: true },
];
export const FARMER_MORE = [
  { to: '/farmer/farm', key: 'farm', icon: Sprout },
  { to: '/farmer/harvest', key: 'harvest', icon: Truck },
  { to: '/farmer/records', key: 'records', icon: NotebookPen },
  { to: '/farmer/history', key: 'history', icon: History },
  { to: '/farmer/assistant', key: 'assistant', icon: Bot },
  { to: '/farmer/settings', key: 'account', icon: Settings },
];

const tabClass = (active) => cx(
  'group relative flex min-w-0 flex-col items-center gap-1 px-1 pb-2 pt-2 text-[11px] font-semibold leading-tight transition-colors duration-200 focus-visible:outline-none',
  active ? 'text-ocean-900' : 'text-slate-500 hover:text-slate-800',
);

/** Icon with the pill that grows in behind the active tab. */
function TabIcon({ icon: Icon, active, children }) {
  return (
    <span className="relative flex h-8 w-14 items-center justify-center">
      <span className={cx('absolute inset-0 rounded-full bg-lagoon-200/70 transition-all duration-300 ease-[var(--ease-spring)] group-focus-visible:ring-2 group-focus-visible:ring-ocean-500', active ? 'scale-100 opacity-100' : 'scale-50 opacity-0')} aria-hidden />
      <Icon className={cx('relative h-[22px] w-[22px] transition-transform duration-300', active ? 'scale-105' : 'group-active:scale-90')} aria-hidden />
      {children}
    </span>
  );
}

function MoreSheet({ open, onClose }) {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const panel = useRef(null);
  useDialog(open, panel, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex animate-fade items-end justify-center bg-ocean-950/40 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t('nav.more')} className="flex max-h-[90dvh] w-full max-w-3xl animate-sheet flex-col rounded-t-3xl bg-white pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-[var(--shadow-float)] outline-none">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200" aria-hidden />
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-3">
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">{t('nav.more')}</p>
            <p className="truncate text-sm text-slate-500">{user?.fullName}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label={t('actions.close')}><X className="h-5 w-5" aria-hidden /></button>
        </div>
        <nav aria-label={t('nav.more')} className="stagger grid min-h-0 gap-1 overflow-y-auto overscroll-contain p-3">
          {FARMER_MORE.map(({ to, key, icon: Icon }) => (
            <NavLink key={to} to={to} onClick={onClose} className={({ isActive }) => cx('flex items-center gap-3 rounded-2xl px-3 py-3 text-base font-semibold transition-colors', isActive ? 'bg-ocean-50 text-ocean-900' : 'text-slate-800 hover:bg-sand-100')}>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ocean-50 text-ocean-700 ring-1 ring-inset ring-ocean-100"><Icon className="h-5 w-5" aria-hidden /></span>{t(`nav.${key}`)}
            </NavLink>
          ))}
          <button type="button" onClick={async () => { onClose(); navigate('/login', { replace: true }); await logout(); }} className="flex items-center gap-3 rounded-2xl px-3 py-3 text-base font-semibold text-red-700 transition-colors hover:bg-red-50">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 ring-1 ring-inset ring-red-100"><LogOut className="h-5 w-5" aria-hidden /></span>{t('actions.logout')}
          </button>
        </nav>
      </div>
    </div>
  );
}

/** Mobile-first farmer shell: slim top bar (logo + language) and a five-item bottom navigation. */
export default function FarmerLayout() {
  const { t } = useI18n();
  const { unread } = useNotifications();
  const [more, setMore] = useState(false);
  const { pathname } = useLocation();
  const moreActive = FARMER_MORE.some((m) => pathname.startsWith(m.to));
  useEffect(() => { window.scrollTo?.(0, 0); }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-sand-50">
      <OfflineBanner />
      <header className="sticky top-0 z-[900] border-b border-slate-200/70 bg-sand-50/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4">
          <div className="min-w-0"><Logo to="/farmer/dashboard" compact /></div>
          <div className="ml-auto shrink-0"><LanguageSwitch /></div>
        </div>
      </header>
      <main key={pathname} className="mx-auto min-w-0 w-full max-w-3xl flex-1 animate-rise px-4 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-5"><Outlet /></main>
      <nav className="fixed inset-x-0 bottom-0 z-[900] px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2" aria-label={t('a11y.farmerNav')}>
        <div className="mx-auto grid max-w-md grid-cols-5 rounded-[1.75rem] border border-white/60 bg-white/90 px-1 shadow-[0_12px_40px_-12px_rgb(5_31_41/0.35)] ring-1 ring-slate-900/5 backdrop-blur-xl">
          {TABS.map(({ to, key, icon, badge }) => (
            <NavLink key={to} to={to} className={({ isActive }) => tabClass(isActive)}>
              {({ isActive }) => (
                <>
                  <TabIcon icon={icon} active={isActive}>
                    {badge && unread > 0 && <span className="absolute -top-1 right-1.5 min-w-[18px] animate-pop rounded-full bg-coral-500 px-1 text-center text-[10px] font-bold leading-[18px] text-white ring-2 ring-white" aria-label={`${unread} ${t('common.unread')}`}>{unread > 9 ? '9+' : unread}</span>}
                  </TabIcon>
                  <span className="w-full truncate text-center">{t(`nav.${key}`)}</span>
                </>
              )}
            </NavLink>
          ))}
          <button type="button" onClick={() => setMore(true)} aria-haspopup="dialog" aria-expanded={more} className={tabClass(moreActive)}>
            <TabIcon icon={MoreHorizontal} active={moreActive} />
            <span className="w-full truncate text-center">{t('nav.more')}</span>
          </button>
        </div>
      </nav>
      <MoreSheet open={more} onClose={() => setMore(false)} />
    </div>
  );
}
