import { dictionaries, translate } from './index.js';

const flatKeys = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) => (v && typeof v === 'object' ? flatKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

describe('i18n', () => {
  test('risk levels use the agreed Kiswahili wording', () => {
    expect(translate('sw', 'risk.level.LOW')).toBe('Hatari ndogo');
    expect(translate('sw', 'risk.level.MEDIUM')).toBe('Hatari ya kati');
    expect(translate('sw', 'risk.level.HIGH')).toBe('Hatari kubwa');
    expect(translate('sw', 'risk.level.CRITICAL')).toBe('Hatari muhimu');
    expect(translate('sw', 'actions.recordHarvest')).toBe('Rekodi Mavuno');
    expect(translate('sw', 'actions.askAI')).toBe('Uliza AI');
  });

  test('interpolates variables and falls back to English, then the key', () => {
    expect(translate('en', 'common.days', { n: 39 })).toBe('39 days');
    expect(translate('sw', 'common.days', { n: 39 })).toBe('siku 39');
    expect(translate('sw', 'does.not.exist')).toBe('does.not.exist');
  });

  test('every English key has a Kiswahili translation', () => {
    const en = flatKeys(dictionaries.en);
    const sw = new Set(flatKeys(dictionaries.sw));
    const missing = en.filter((k) => !sw.has(k));
    expect(missing).toEqual([]);
  });
});
