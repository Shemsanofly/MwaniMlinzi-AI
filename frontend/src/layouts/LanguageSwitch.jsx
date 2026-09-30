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
    <div role="group" aria-label={t('a11y.language')} className={cx('relative inline-grid grid-cols-2 rounded-xl bg-slate-900/[0.05] p-0.5 text-sm font-semibold ring-1 ring-inset ring-slate-900/5', className)}>
      <span className={cx('pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-[10px] bg-white shadow-[0_1px_3px_rgb(8_49_64/0.18)] transition-transform duration-300 ease-[var(--ease-spring)]', lang === 'sw' && 'translate-x-full')} aria-hidden />
      {OPTIONS.map((o) => (
        <button
          key={o.code}
          type="button"
          lang={o.code}
          onClick={() => choose(o.code)}
          aria-pressed={lang === o.code}
          className={cx('relative z-10 rounded-[10px] px-2.5 py-1.5 text-center transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-500/40', lang === o.code ? 'text-ocean-900' : 'text-slate-500 hover:text-slate-800')}
        >
          <span className="sm:hidden">{o.short}</span>
          <span className="hidden sm:inline">{o.long}</span>
        </button>
      ))}
    </div>
  );
}
