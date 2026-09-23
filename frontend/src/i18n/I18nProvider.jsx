import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { translate } from './index.js';

const KEY = 'mwanimlinzi.lang';
const I18nContext = createContext(null);

const initialLang = () => {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'sw') return saved;
  } catch { /* storage unavailable */ }
  return 'sw';
};

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(initialLang);
  const setLang = useCallback((l) => {
    setLangState(l);
    try { localStorage.setItem(KEY, l); } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const t = useCallback((key, vars) => translate(lang, key, vars), [lang]);
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
