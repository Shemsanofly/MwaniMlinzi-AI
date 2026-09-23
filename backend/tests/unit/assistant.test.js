import { detectIntent, detectLanguage, parseObservation } from '../../src/services/assistantService.js';

describe('assistant intent + parsing (deterministic, no LLM)', () => {
  test.each([
    ['Kwa nini hatari yangu iko juu?', 'WHY_RISK'],
    ['Nifanye nini?', 'WHAT_TO_DO'],
    ['What should I do now?', 'WHAT_TO_DO'],
    ['What medicine should I use?', 'TREATMENT'],
    ['Nitumie dawa gani?', 'TREATMENT'],
    ['When should I harvest?', 'HARVEST'],
    ['Hali ya bahari ikoje?', 'ENVIRONMENT'],
    ['I see whitening on 20% of the lines', 'RECORD_OBSERVATION'],
    ['Naona mwani mweupe', 'RECORD_OBSERVATION'],
    ['Habari', 'GREETING'],
    ['xyz', 'UNKNOWN'],
  ])('%s → %s', (msg, intent) => expect(detectIntent(msg)).toBe(intent));

  test('language detection', () => {
    expect(detectLanguage('Kwa nini hatari yangu iko juu?')).toBe('sw');
    expect(detectLanguage('Why is my risk high?')).toBe('en');
  });

  test('natural language → structured observation draft', () => {
    const d = parseObservation('I see whitening and breakage on 35% of my lines');
    expect(d).toMatchObject({ whitening: true, breakage: true, percentAffected: 35, cropCondition: 'POOR' });
    expect(parseObservation('Naona mwani mweupe asilimia 10')).toMatchObject({ whitening: true, percentAffected: 10 });
  });
});
