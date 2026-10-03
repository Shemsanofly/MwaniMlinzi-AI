import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import sw from './sw.json';

/**
 * One JSON resource file per language. Common keys live at the top level (t('risk.level.HIGH'));
 * area keys are nested under their namespace (t('farmer.x'), t('coop.x'), …).
 */
export const dictionaries = { en, sw };

export const LANGUAGES = [{ code: 'sw', label: 'Kiswahili' }, { code: 'en', label: 'English' }];

export const STORAGE_KEY = 'mwanimlinzi.lang';
export const DEFAULT_LANG = 'sw';
const SUPPORTED = ['en', 'sw'];

/** The language saved in localStorage, or the default (Kiswahili). Storage may be unavailable. */
export function readStoredLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (SUPPORTED.includes(saved)) return saved;
  } catch { /* storage unavailable */ }
  return DEFAULT_LANG;
}

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, sw: { translation: sw } },
    lng: readStoredLang(),
    fallbackLng: 'en',
    supportedLngs: SUPPORTED,
    initAsync: false,
    nsSeparator: false,
    returnNull: false,
    returnEmptyString: false,
    interpolation: { escapeValue: false, prefix: '{', suffix: '}' },
    react: { useSuspense: false },
  });
}

/** Translate outside React (tests, helpers). Falls back to English, then to the key itself. */
export function translate(lang, key, vars) {
  return i18n.getFixedT(lang)(key, vars);
}

export default i18n;
