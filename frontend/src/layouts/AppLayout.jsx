import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Activity, BarChart3, Bell, BookOpen, Bot, ClipboardCheck, ClipboardList, Cpu, FlaskConical, History, Home, LogOut, Map, Menu,
  MessageSquare, Settings, ShieldCheck, Smartphone, Sprout, Truck, Users, X,
} from 'lucide-react';
import { useAuth } from '../stores/AuthContext.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import Logo from './Logo.jsx';
import LanguageSwitch from './LanguageSwitch.jsx';
import NotificationBell from './NotificationBell.jsx';
import DemoBanner from './DemoBanner.jsx';
import { cx } from '../components/ui/index.jsx';

export const NAV = {
  FARMER: [
    { to: '/farmer/dashboard', key: 'dashboard', icon: Home },
    { to: '/farmer/farm', key: 'farm', icon: Sprout },
    { to: '/farmer/risk', key: 'risk', icon: Activity },
    { to: '/farmer/observations', key: 'observations', icon: ClipboardList },
    { to: '/farmer/harvest', key: 'harvest', icon: Truck },
    { to: '/farmer/history', key: 'history', icon: History },
    { to: '/farmer/assistant', key: 'assistant', icon: Bot },
  ],
  COOPERATIVE_ADMIN: [
    { to: '/cooperative/dashboard', key: 'dashboard', icon: Home },
    { to: '/cooperative/farms', key: 'farms', icon: Sprout },
    { to: '/cooperative/map', key: 'map', icon: Map },
    { to: '/cooperative/forecast', key: 'forecast', icon: BarChart3 },
    { to: '/cooperative/alerts', key: 'alerts', icon: Bell },
  ],
  EXTENSION_OFFICER: [
    { to: '/extension/dashboard', key: 'dashboard', icon: Home },
    { to: '/extension/risk-map', key: 'riskMap', icon: Map },
    { to: '/extension/farms', key: 'farms', icon: Sprout },
    { to: '/extension/reviews', key: 'reviews', icon: ClipboardCheck },
    { to: '/extension/actions', key: 'actionLibrary', icon: BookOpen },
  ],
  BUYER: [
    { to: '/buyer/dashboard', key: 'dashboard', icon: Home },
    { to: '/buyer/forecast', key: 'forecast', icon: BarChart3 },
    { to: '/buyer/supply', key: 'supply', icon: Truck },
  ],
  ADMIN: [
    { to: '/admin/dashboard', key: 'dashboard', icon: Home },
    { to: '/admin/users', key: 'users', icon: Users },
    { to: '/admin/actions', key: 'actionLibrary', icon: BookOpen },
    { to: '/admin/models', key: 'models', icon: Cpu },
    { to: '/admin/settings', key: 'settings', icon: Settings },
    { to: '/admin/audit', key: 'audit', icon: ShieldCheck },
  ],
};

const DEMO_NAV = [
  { to: '/demo/simulation', key: 'simulation', icon: FlaskConical },
  { to: '/demo/ussd', key: 'ussd', icon: Smartphone },
  { to: '/demo/sms', key: 'sms', icon: MessageSquare },
];

function NavItems({ items, onNavigate }) {
  const { t } = useI18n();
  return items.map(({ to, key, icon: Icon }) => (
    <NavLink
      key={to}
      to={to}
      onClick={onNavigate}
      className={({ isActive }) => cx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition', isActive ? 'bg-ocean-700 text-white' : 'text-ocean-100 hover:bg-ocean-800 hover:text-white')}
    >
      <Icon className="h-4.5 w-4.5 h-[18px] w-[18px] shrink-0" aria-hidden />
      {t(`nav.${key}`)}
    </NavLink>
  ));
}

/** Staff layout (cooperative, extension, buyer, admin): sidebar on desktop, drawer on mobile. */
export default function AppLayout() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const roles = user?.roles || [];
  const sections = ['ADMIN', 'COOPERATIVE_ADMIN', 'EXTENSION_OFFICER', 'BUYER', 'FARMER'].filter((r) => roles.includes(r));
  const showDemo = !roles.every((r) => r === 'BUYER');

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 overflow-y-auto p-3" aria-label="Main">
      {sections.map((role) => (
        <div key={role} className="mb-3">
          {sections.length > 1 && <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-ocean-300">{t(`roles.${role}`)}</p>}
          <NavItems items={NAV[role]} onNavigate={() => setOpen(false)} />
        </div>
      ))}
      {showDemo && (
        <div className="mb-3">
          <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-ocean-300">{t('nav.demo')}</p>
          <NavItems items={DEMO_NAV} onNavigate={() => setOpen(false)} />
        </div>
      )}
      <div className="mt-auto rounded-lg bg-ocean-800/60 p-3 text-xs text-ocean-100">
        <p className="font-semibold text-white">{user?.fullName}</p>
        <p className="truncate">{user?.email}</p>
        <p className="mt-0.5 text-ocean-300">{roles.map((r) => t(`roles.${r}`)).join(', ')}</p>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <DemoBanner />
      <div className="flex flex-1">
        <aside className="hidden w-64 shrink-0 bg-ocean-900 lg:block">
          <div className="flex h-16 items-center px-5"><Logo light to="/" /></div>
          <div className="h-[calc(100vh-4rem)] sticky top-0">{sidebar}</div>
        </aside>
        {open && (
          <div className="fixed inset-0 z-[1200] flex lg:hidden">
            <div className="w-72 bg-ocean-900">
              <div className="flex h-16 items-center justify-between px-4"><Logo light /><button type="button" onClick={() => setOpen(false)} className="text-white" aria-label="Close menu"><X /></button></div>
              {sidebar}
            </div>
            <button type="button" className="flex-1 bg-slate-900/50" onClick={() => setOpen(false)} aria-label="Close menu" />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-[900] flex h-16 min-w-0 items-center gap-2 border-b border-slate-200 bg-white/95 px-3 backdrop-blur sm:gap-3 sm:px-6">
            <button type="button" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu /></button>
            <div className="min-w-0 truncate lg:hidden"><Logo /></div>
            <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
              <LanguageSwitch />
              <NotificationBell />
              <button type="button" onClick={async () => { await logout(); navigate('/login'); }} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">
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

