import { RISK_RULES } from '../rules/riskRules.js';
import { round, sigmoid } from './features.js';

/** RiskRuleEngine: deterministic, always-available baseline model. */
export const RiskRuleEngine = {
  version: 'rules-v1',

  evaluate(riskType, features) {
    const rule = RISK_RULES[riskType];
    if (!rule) throw new Error(`Unknown risk type ${riskType}`);
    let logit = rule.bias;
    const factors = [];
    for (const term of rule.terms) {
      const c = term.compute(features);
      if (!Number.isFinite(c) || c === 0) continue;
      logit += c;
      if (Math.abs(c) < 0.05) continue;
      factors.push({
        code: term.code,
        label: term.en(features),
        labelSw: term.sw(features),
        value: term.value(features),
        contribution: round(c, 3),
        direction: c > 0 ? 'INCREASES' : 'DECREASES',
      });
    }
    factors.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
    const missing = rule.requires.filter((k) => features[k] == null);
    return { probability: round(sigmoid(logit), 4), logit: round(logit, 3), factors, missing, horizonHours: rule.horizonHours };
  },
};
