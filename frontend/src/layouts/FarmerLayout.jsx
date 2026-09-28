import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Activity, Bell, Bot, ClipboardList, History, Home, LogOut, MoreHorizontal, Settings, Sprout, Truck, X } from 'lucide-react';
import { useAuth } from '../stores/AuthContext.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import Logo from './Logo.jsx';
import LanguageSwitch from './LanguageSwitch.jsx';
import DemoBanner from './DemoBanner.jsx';
import OfflineBanner from './OfflineBanner.jsx';
import { useNotifications } from '../components/notifications.jsx';
import { cx } from '../components/ui/index.jsx';

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
  { to: '/farmer/history', key: 'history', icon: History },
  { to: '/farmer/assistant', key: 'assistant', icon: Bot },
  { to: '/farmer/settings', key: 'account', icon: Settings },
];

const tabClass = (active) => cx(
  'relative flex min-w-0 flex-col items-center gap-0.5 px-1 pb-2 pt-2.5 text-[11px] font-semibold leading-tight transition',
  active ? 'text-ocean-700' : 'text-slate-500 hover:text-slate-800',
);

function MoreSheet({ open, onClose }) {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const panel = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    panel.current?.querySelector('a,button')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-slate-900/40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} role="dialog" aria-modal="true" aria-label={t('nav.more')} className="w-full max-w-3xl rounded-t-2xl bg-white pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">{t('nav.more')}</p>
            <p className="truncate text-sm text-slate-500">{user?.fullName}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label={t('actions.close')}><X className="h-5 w-5" aria-hidden /></button>
        </div>
        <nav aria-label={t('nav.more')} className="grid gap-1 p-3">
          {FARMER_MORE.map(({ to, key, icon: Icon }) => (
            <NavLink key={to} to={to} onClick={onClose} className={({ isActive }) => cx('flex items-center gap-3 rounded-xl px-3 py-3 text-base font-medium', isActive ? 'bg-ocean-50 text-ocean-800' : 'text-slate-800 hover:bg-slate-100')}>
              <Icon className="h-5 w-5 text-ocean-700" aria-hidden />{t(`nav.${key}`)}
            </NavLink>
          ))}
          <button type="button" onClick={async () => { onClose(); navigate('/login', { replace: true }); await logout(); }} className="flex items-center gap-3 rounded-xl px-3 py-3 text-base font-medium text-red-700 hover:bg-red-50">
            <LogOut className="h-5 w-5" aria-hidden />{t('actions.logout')}
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
      <DemoBanner />
      <header className="sticky top-0 z-[900] border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4">
          <div className="min-w-0"><Logo to="/farmer/dashboard" compact /></div>
          <div className="ml-auto shrink-0"><LanguageSwitch /></div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-4"><Outlet /></main>
      <nav className="fixed inset-x-0 bottom-0 z-[900] border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]" aria-label={t('a11y.farmerNav')}>
        <div className="mx-auto grid max-w-3xl grid-cols-5">
          {TABS.map(({ to, key, icon: Icon, badge }) => (
            <NavLink key={to} to={to} className={({ isActive }) => tabClass(isActive)}>
              <span className="relative">
                <Icon className="h-6 w-6" aria-hidden />
                {badge && unread > 0 && <span className="absolute -right-2.5 -top-1.5 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-[18px] text-white" aria-label={`${unread} ${t('common.unread')}`}>{unread > 9 ? '9+' : unread}</span>}
              </span>
              <span className="w-full truncate text-center">{t(`nav.${key}`)}</span>
            </NavLink>
          ))}
          <button type="button" onClick={() => setMore(true)} aria-haspopup="dialog" aria-expanded={more} className={tabClass(moreActive)}>
            <MoreHorizontal className="h-6 w-6" aria-hidden />
            <span className="w-full truncate text-center">{t('nav.more')}</span>
          </button>
        </div>
      </nav>
      <MoreSheet open={more} onClose={() => setMore(false)} />
    </div>
  );
}
