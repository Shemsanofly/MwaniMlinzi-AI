import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Activity, Bot, ClipboardList, History, Home, LogOut, Menu, Settings, Sprout, Truck, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../stores/AuthContext.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import Logo from './Logo.jsx';
import LanguageSwitch from './LanguageSwitch.jsx';
import NotificationBell from './NotificationBell.jsx';
import DemoBanner from './DemoBanner.jsx';
import OfflineBanner from './OfflineBanner.jsx';
import { cx } from '../components/ui/index.jsx';

const BOTTOM = [
  { to: '/farmer/dashboard', key: 'dashboard', icon: Home },
  { to: '/farmer/risk', key: 'risk', icon: Activity },
  { to: '/farmer/observations', key: 'observations', icon: ClipboardList },
  { to: '/farmer/history', key: 'history', icon: History },
  { to: '/farmer/assistant', key: 'assistant', icon: Bot },
];
const MORE = [
  { to: '/farmer/farm', key: 'farm', icon: Sprout },
  { to: '/farmer/harvest', key: 'harvest', icon: Truck },
  { to: '/farmer/settings', key: 'account', icon: Settings },
];

/** Mobile-first farmer shell: compact top bar + large bottom navigation. */
export default function FarmerLayout() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  return (
    <div className="flex min-h-screen flex-col bg-sand-50">
      <OfflineBanner />
      <DemoBanner />
      <header className="sticky top-0 z-[900] border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4">
          <Logo to="/farmer/dashboard" />
          <div className="ml-auto flex items-center gap-1.5">
            <LanguageSwitch />
            <NotificationBell />
            <button type="button" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" onClick={() => setMenu((m) => !m)} aria-label={t('a11y.menu')} aria-expanded={menu}>{menu ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}</button>
          </div>
        </div>
        {menu && (
          <div className="mx-auto max-w-3xl space-y-1 border-t border-slate-100 px-4 py-3">
            <p className="px-2 text-sm text-slate-500">{user?.fullName}</p>
            {MORE.map(({ to, key, icon: Icon }) => (
              <NavLink key={to} to={to} onClick={() => setMenu(false)} className="flex items-center gap-3 rounded-lg px-2 py-2 text-base font-medium text-slate-800 hover:bg-slate-100"><Icon className="h-5 w-5 text-ocean-700" />{t(`nav.${key}`)}</NavLink>
            ))}
            <button type="button" onClick={async () => { await logout(); navigate('/login'); }} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-base font-medium text-red-700 hover:bg-red-50"><LogOut className="h-5 w-5" />{t('actions.logout')}</button>
          </div>
        )}
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-4"><Outlet /></main>
      <nav className="fixed inset-x-0 bottom-0 z-[900] border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]" aria-label={t('a11y.farmerNav')}>
        <div className="mx-auto grid max-w-3xl grid-cols-5">
          {BOTTOM.map(({ to, key, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold', isActive ? 'text-ocean-700' : 'text-slate-500')}>
              <Icon className="h-6 w-6" aria-hidden />
              <span className="truncate">{t(`nav.${key}`)}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
