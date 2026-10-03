import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { MessageSquare, Phone, Smartphone } from 'lucide-react';
import { useAuth } from '../stores/AuthContext.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import Logo from './Logo.jsx';
import LanguageSwitch from './LanguageSwitch.jsx';
import OfflineBanner from './OfflineBanner.jsx';
import { cx } from '../components/ui/index.jsx';

export default function PublicLayout() {
  const { t } = useI18n();
  const { isAuthenticated, homePath } = useAuth();
  const { pathname } = useLocation();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => { window.scrollTo?.(0, 0); }, [pathname]);

  const link = ({ isActive }) => cx(
    'relative rounded-lg px-3 py-2 text-sm font-semibold transition-colors after:absolute after:inset-x-3 after:-bottom-0.5 after:h-0.5 after:origin-left after:rounded-full after:bg-lagoon-400 after:transition-transform after:duration-300',
    isActive ? 'text-ocean-900 after:scale-x-100' : 'text-slate-600 after:scale-x-0 hover:text-ocean-900 hover:after:scale-x-100',
  );
  const cta = 'whitespace-nowrap rounded-xl bg-ocean-900 px-3.5 py-2 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] transition hover:bg-ocean-800 active:scale-[0.97] sm:px-4';
  return (
    <div className="flex min-h-screen flex-col">
      <OfflineBanner />
      <header className={cx('sticky top-0 z-[900] border-b bg-sand-50/80 backdrop-blur-xl transition-[border-color,box-shadow] duration-300', scrolled ? 'border-slate-200/80 shadow-[0_6px_24px_-16px_rgb(8_49_64/0.35)]' : 'border-transparent')}>
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-4 sm:px-6">
          <div className="min-w-0"><Logo compact iconOnlyOnPhone="xs" /></div>
          <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label={t('a11y.publicNav')}>
            <NavLink to="/about" className={link}>{t('nav.about')}</NavLink>
            <NavLink to="/how-it-works" className={link}>{t('nav.howItWorks')}</NavLink>
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <LanguageSwitch />
            {isAuthenticated
              ? <Link to={homePath} className={cta}>{t('nav.dashboard')}</Link>
              : <Link to="/login" className={cta}>{t('actions.login')}</Link>}
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-1 md:hidden" aria-label={t('a11y.publicNav')}>
          <NavLink to="/about" className={link}>{t('nav.about')}</NavLink>
          <NavLink to="/how-it-works" className={link}>{t('nav.howItWorks')}</NavLink>
        </nav>
      </header>
      <main className="flex-1"><Outlet /></main>
      <footer className="ocean-band text-ocean-200">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 pb-8 pt-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo light />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-ocean-200/90">{t('public.footer.blurb')}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-lagoon-300">{t('public.footer.product')}</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li><Link to="/how-it-works" className="transition-colors hover:text-white">{t('nav.howItWorks')}</Link></li>
              <li><Link to="/about" className="transition-colors hover:text-white">{t('nav.about')}</Link></li>
              <li><Link to="/register" className="transition-colors hover:text-white">{t('actions.register')}</Link></li>
              <li><Link to="/login" className="transition-colors hover:text-white">{t('actions.login')}</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-lagoon-300">{t('public.footer.reach')}</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-lagoon-300" aria-hidden />{t('public.hero.channelWeb')}</li>
              <li className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-lagoon-300" aria-hidden />{t('public.hero.channelSms')}</li>
              <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-lagoon-300" aria-hidden />{t('public.hero.channelUssd')}</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p>© {new Date().getFullYear()} MwaniMlinzi AI · {t('app.tagline')}</p>
            <p className="text-ocean-300">{t('a11y.mapCredit')}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
