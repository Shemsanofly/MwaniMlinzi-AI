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
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-ocean-100 text-ocean-700"><Compass className="h-8 w-8" aria-hidden /></span>
        <p className="mt-6 text-sm font-bold uppercase tracking-wider text-ocean-600">404</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{t('public.notFound.title')}</h1>
        <p className="mt-3 text-slate-600">{t('public.notFound.text')}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/" className="rounded-lg bg-ocean-700 px-5 py-3 font-semibold text-white hover:bg-ocean-800">{t('public.notFound.home')}</Link>
          {isAuthenticated && <Link to={homePath} className="rounded-lg px-5 py-3 font-semibold text-ocean-800 ring-1 ring-inset ring-ocean-200 hover:bg-ocean-50">{t('nav.dashboard')}</Link>}
        </div>
      </div>
    </div>
  );
}
