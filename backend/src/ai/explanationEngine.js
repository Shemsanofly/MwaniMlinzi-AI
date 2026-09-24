import { LEVEL_LABELS, RISK_LABELS } from './constants.js';

/**
 * ExplanationEngine: turns the structured factors produced by the risk model into
 * plain-language text (English + Kiswahili). Text comes only from backend factors —
 * an LLM may rephrase it later but never invents factors.
 */
export const ExplanationEngine = {
  explain({ riskType, level, probability, factors, insufficientData }, lang = 'en') {
    const pct = Math.round(probability * 100);
    const risk = RISK_LABELS[riskType][lang];
    const lvl = LEVEL_LABELS[level][lang];
    const reasons = factors.filter((f) => f.direction === 'INCREASES').slice(0, 3).map((f) => (lang === 'sw' ? f.labelSw : f.label));
    if (lang === 'sw') {
      const head = `${risk}: ${lvl} (${pct}%).`;
      const why = reasons.length ? ` Sababu kuu: ${reasons.join('; ')}.` : ' Hakuna dalili kubwa za hatari kwa sasa.';
      const warn = insufficientData ? ' Tahadhari: data haitoshi kwa utabiri wa kuaminika.' : '';
      return head + why + warn;
    }
    const head = `${risk} risk: ${LEVEL_LABELS[level].en.toUpperCase()} (${pct}%).`;
    const why = reasons.length ? ` Main reasons: ${reasons.join('; ')}.` : ' No strong risk signals at the moment.';
    const warn = insufficientData ? ' Caution: insufficient data for a reliable prediction.' : '';
    return head + why + warn;
  },
};
