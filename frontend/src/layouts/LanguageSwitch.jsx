import { Languages } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useAuth } from '../stores/AuthContext.jsx';
import { authApi } from '../api/endpoints.js';

export default function LanguageSwitch({ className = '' }) {
  const { lang, setLang } = useI18n();
  const { isAuthenticated } = useAuth();
  const toggle = () => {
    const next = lang === 'sw' ? 'en' : 'sw';
    setLang(next);
    if (isAuthenticated) authApi.updateMe({ preferredLanguage: next }).catch(() => {});
  };
  return (
    <button type="button" onClick={toggle} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-ocean-800 ring-1 ring-ocean-200 hover:bg-ocean-50 ${className}`} aria-label="Switch language / Badilisha lugha">
      <Languages className="h-4 w-4" aria-hidden />
      {lang === 'sw' ? 'EN' : 'SW'}
    </button>
  );
}
