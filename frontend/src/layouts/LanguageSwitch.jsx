import { useI18n } from '../i18n/I18nProvider.jsx';
import { useAuth } from '../stores/AuthContext.jsx';
import { authApi } from '../api/endpoints.js';
import { cx } from '../components/ui/index.jsx';

const OPTIONS = [
  { code: 'en', short: 'EN', long: 'English' },
  { code: 'sw', short: 'SW', long: 'Kiswahili' },
];

/**
 * [English | Kiswahili] switch. The choice is stored in localStorage (by the i18n provider) and,
 * when logged in, saved to the user's profile so SMS/USSD use the same language.
 */
export default function LanguageSwitch({ className = '' }) {
  const { lang, setLang, t } = useI18n();
  const { isAuthenticated, refresh } = useAuth();
  const choose = (next) => {
    if (next === lang) return;
    setLang(next);
    if (isAuthenticated) authApi.updateMe({ preferredLanguage: next }).then(() => refresh?.()).catch(() => {});
  };
  return (
    <div role="group" aria-label={t('a11y.language')} className={cx('inline-flex overflow-hidden rounded-lg text-sm font-semibold ring-1 ring-ocean-200', className)}>
      {OPTIONS.map((o, i) => (
        <button
          key={o.code}
          type="button"
          lang={o.code}
          onClick={() => choose(o.code)}
          aria-pressed={lang === o.code}
          className={cx('px-2.5 py-1.5 transition', i > 0 && 'border-l border-ocean-200', lang === o.code ? 'bg-ocean-700 text-white' : 'text-ocean-800 hover:bg-ocean-50')}
        >
          <span className="sm:hidden">{o.short}</span>
          <span className="hidden sm:inline">{o.long}</span>
        </button>
      ))}
    </div>
  );
}
