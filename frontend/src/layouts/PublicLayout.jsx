import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../stores/AuthContext.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import Logo from './Logo.jsx';
import LanguageSwitch from './LanguageSwitch.jsx';
import DemoBanner from './DemoBanner.jsx';

export default function PublicLayout() {
  const { t } = useI18n();
  const { isAuthenticated, homePath } = useAuth();
  const link = ({ isActive }) => `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'text-ocean-800' : 'text-slate-600 hover:text-ocean-800'}`;
  return (
    <div className="flex min-h-screen flex-col">
      <DemoBanner />
      <header className="sticky top-0 z-[900] border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Logo />
          <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Public">
            <NavLink to="/about" className={link}>{t('nav.about')}</NavLink>
            <NavLink to="/how-it-works" className={link}>{t('nav.howItWorks')}</NavLink>
            <NavLink to="/demo" className={link}>{t('nav.demo')}</NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitch />
            {isAuthenticated
              ? <Link to={homePath} className="rounded-lg bg-ocean-700 px-4 py-2 text-sm font-semibold text-white hover:bg-ocean-800">{t('nav.dashboard')}</Link>
              : <Link to="/login" className="rounded-lg bg-ocean-700 px-4 py-2 text-sm font-semibold text-white hover:bg-ocean-800">{t('actions.login')}</Link>}
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-2 md:hidden" aria-label="Public mobile">
          <NavLink to="/about" className={link}>{t('nav.about')}</NavLink>
          <NavLink to="/how-it-works" className={link}>{t('nav.howItWorks')}</NavLink>
          <NavLink to="/demo" className={link}>{t('nav.demo')}</NavLink>
        </nav>
      </header>
      <main className="flex-1"><Outlet /></main>
      <footer className="border-t border-slate-200 bg-ocean-900 text-ocean-100">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} MwaniMlinzi AI — {t('app.tagline')}</p>
          <p className="text-xs text-ocean-300">Map data © OpenStreetMap contributors</p>
        </div>
      </footer>
    </div>
  );
}
