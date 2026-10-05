import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { useAuth } from '../../stores/AuthContext.jsx';
import { useI18n } from '../../i18n/I18nProvider.jsx';

export default function NotFound() {
  const { t } = useI18n();
  const { isAuthenticated, homePath } = useAuth();
  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-sand-50 px-4 py-16">
      <div className="max-w-md text-center">
        <span className="mx-auto flex h-20 w-20 animate-pop items-center justify-center rounded-3xl bg-gradient-to-br from-ocean-50 to-sand-100 text-ocean-700 shadow-[var(--shadow-soft)] ring-1 ring-inset ring-ocean-100"><Compass className="h-9 w-9 motion-safe:animate-[sway_4s_ease-in-out_infinite]" aria-hidden /></span>
        <p className="display mt-6 text-6xl font-medium text-ocean-200">404</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">{t('public.notFound.title')}</h1>
        <p className="mt-3 text-slate-600">{t('public.notFound.text')}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/" className="rounded-xl bg-ocean-900 px-5 py-3 font-semibold text-white transition hover:bg-ocean-800 active:scale-[0.97]">{t('public.notFound.home')}</Link>
          {isAuthenticated && <Link to={homePath} className="rounded-xl bg-white px-5 py-3 font-semibold text-ocean-800 ring-1 ring-inset ring-slate-300/80 transition hover:bg-ocean-50">{t('nav.dashboard')}</Link>}
        </div>
      </div>
    </div>
  );
}
