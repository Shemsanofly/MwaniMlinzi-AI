import enCommon from './locales/en/common.js';
import enFarmer from './locales/en/farmer.js';
import enCoop from './locales/en/coop.js';
import enExtension from './locales/en/extension.js';
import enBuyer from './locales/en/buyer.js';
import enAdmin from './locales/en/admin.js';
import enDemo from './locales/en/demo.js';
import enPublic from './locales/en/public.js';
import swCommon from './locales/sw/common.js';
import swFarmer from './locales/sw/farmer.js';
import swCoop from './locales/sw/coop.js';
import swExtension from './locales/sw/extension.js';
import swBuyer from './locales/sw/buyer.js';
import swAdmin from './locales/sw/admin.js';
import swDemo from './locales/sw/demo.js';
import swPublic from './locales/sw/public.js';

/** Common keys live at the top level (t('risk.level.HIGH')); area keys are namespaced (t('farmer.x')). */
export const dictionaries = {
  en: { ...enCommon, farmer: enFarmer, coop: enCoop, extension: enExtension, buyer: enBuyer, admin: enAdmin, demo: enDemo, public: enPublic },
  sw: { ...swCommon, farmer: swFarmer, coop: swCoop, extension: swExtension, buyer: swBuyer, admin: swAdmin, demo: swDemo, public: swPublic },
};

export const LANGUAGES = [{ code: 'sw', label: 'Kiswahili' }, { code: 'en', label: 'English' }];

const lookup = (dict, key) => key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), dict);

export function translate(lang, key, vars) {
  let s = lookup(dictionaries[lang], key);
  if (typeof s !== 'string') s = lookup(dictionaries.en, key);
  if (typeof s !== 'string') return key;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`)) : s;
}
