import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n, { readStoredLang, STORAGE_KEY } from './index.js';

const I18nContext = createContext(null);

/** Switch i18next to the language saved in storage (re-read on every provider mount). */
const syncStoredLang = () => {
  const stored = readStoredLang();
  if (i18n.language !== stored) i18n.changeLanguage(stored);
  return stored;
};

export function I18nProvider({ children }) {
  // Re-read storage at mount so a language chosen earlier (or set by a test) wins before first paint.
  useState(syncStoredLang);
  const { t: i18nT, i18n: instance } = useTranslation();
  const lang = instance.resolvedLanguage || instance.language;

  const setLang = useCallback((l) => {
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* storage unavailable */ }
    instance.changeLanguage(l);
  }, [instance]);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  // `lang` is a dependency so consumers memoising on `t` recompute when the language changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const t = useCallback((key, vars) => i18nT(key, vars), [i18nT, lang]);
  /** Pick the right field from bilingual API objects, e.g. tx(action, 'action') → action.actionSw in Kiswahili. */
  const tx = useCallback((obj, field) => (obj ? (lang === 'sw' ? obj[`${field}Sw`] ?? obj[field] : obj[field]) : ''), [lang]);
  const value = useMemo(() => ({ lang, setLang, t, tx }), [lang, setLang, t, tx]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
