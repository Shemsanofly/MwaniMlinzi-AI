import en from './en.json';
import sw from './sw.json';
import i18n, { dictionaries, translate, LANGUAGES } from './index.js';

const flatKeys = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) => (v && typeof v === 'object' ? flatKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

describe('i18n (i18next resources)', () => {
  test('i18next is initialised with both JSON resources and English fallback', () => {
    expect(i18n.isInitialized).toBe(true);
    expect(i18n.options.fallbackLng).toEqual(['en']);
    expect(dictionaries).toEqual({ en, sw });
    expect(LANGUAGES.map((l) => l.code)).toEqual(['sw', 'en']);
  });

  test('en.json and sw.json have exactly the same keys', () => {
    const enKeys = flatKeys(en);
    const swKeys = flatKeys(sw);
    const swSet = new Set(swKeys);
    const enSet = new Set(enKeys);
    expect(enKeys.filter((k) => !swSet.has(k))).toEqual([]);
    expect(swKeys.filter((k) => !enSet.has(k))).toEqual([]);
  });

  test('every value is a non-empty string', () => {
    for (const dict of [en, sw]) {
      const walk = (o, p = '') => Object.entries(o).forEach(([k, v]) => {
        if (v && typeof v === 'object') walk(v, `${p}${k}.`);
        else expect(typeof v === 'string' && v.length > 0, `${p}${k}`).toBe(true);
      });
      walk(dict);
    }
  });

  test('area namespaces are nested and common keys stay at the top level', () => {
    for (const ns of ['farmer', 'coop', 'extension', 'buyer', 'admin', 'demo', 'public']) expect(typeof en[ns]).toBe('object');
    expect(typeof en.risk.level.HIGH).toBe('string');
  });

  test('risk levels use the agreed Kiswahili wording', () => {
    expect(translate('sw', 'risk.level.LOW')).toBe('Hatari ndogo');
    expect(translate('sw', 'risk.level.MEDIUM')).toBe('Hatari ya kati');
    expect(translate('sw', 'risk.level.HIGH')).toBe('Hatari kubwa');
    expect(translate('sw', 'risk.level.CRITICAL')).toBe('Hatari kubwa sana');
    expect(translate('sw', 'risk.levelLong.CRITICAL')).toBe('Hatari kubwa sana');
    expect(translate('sw', 'actions.recordHarvest')).toBe('Rekodi Mavuno');
    expect(translate('sw', 'actions.askAI')).toBe('Uliza AI');
  });

  test('interpolates {var} placeholders', () => {
    expect(translate('en', 'common.days', { n: 39 })).toBe('39 days');
    expect(translate('sw', 'common.days', { n: 39 })).toBe('siku 39');
    expect(translate('en', 'risk.horizon', { hours: 72 })).toBe(translate('en', 'risk.horizon').replace('{hours}', '72'));
  });

  test('falls back to English, then to the key', () => {
    i18n.addResource('en', 'translation', 'test.onlyEnglish', 'Only English');
    try {
      expect(translate('sw', 'test.onlyEnglish')).toBe('Only English');
    } finally {
      delete i18n.store.data.en.translation.test;
    }
    expect(translate('sw', 'does.not.exist')).toBe('does.not.exist');
  });

  test('backend error codes are translated in both languages', () => {
    const codes = ['VALIDATION_ERROR', 'UNAUTHORIZED', 'INVALID_CREDENTIALS', 'ACCOUNT_DISABLED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'RATE_LIMITED',
      'DATABASE_UNAVAILABLE', 'INTERNAL_ERROR', 'NETWORK_ERROR', 'UPLOAD_ERROR', 'PAYLOAD_TOO_LARGE', 'NOT_CONFIGURED', 'PROVIDER_ERROR'];
    for (const code of codes) {
      expect(typeof en.errors.codes[code]).toBe('string');
      expect(typeof sw.errors.codes[code]).toBe('string');
      expect(sw.errors.codes[code]).not.toBe(en.errors.codes[code]);
    }
  });
});
