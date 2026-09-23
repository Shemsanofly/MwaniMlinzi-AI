import prisma from '../config/prisma.js';
import { createLLMProvider } from '../providers/llmProvider.js';
import { RISK_LABELS, LEVEL_LABELS } from '../ai/constants.js';
import { RiskService } from './riskService.js';
import { EnvironmentService } from './environmentService.js';
import { farmScope } from './accessService.js';
import { cropAgeDays, daysBetween } from '../utils/dates.js';
import { forbidden } from '../utils/errors.js';

let llm = createLLMProvider();
export const setLLMProvider = (p) => { llm = p; };
export const getLLMProvider = () => llm;

const has = (text, words) => words.some((w) => text.includes(w));

const KW = {
  treatment: ['medicine', 'chemical', 'pesticide', 'treat', 'cure', 'spray', 'fertilizer', 'fertiliser', 'dawa', 'kemikali', 'tibu', 'matibabu', 'mbolea', 'nyunyiz'],
  report: ['i see', 'i saw', 'i found', 'there is', 'there are', 'naona', 'nimeona', 'kuna ', 'report', 'ripoti'],
  symptom: ['whit', 'bleach', 'break', 'broke', 'epiphyt', 'weupe', 'nyeupe', 'meupe', 'rangi', 'kukatika', 'imekatika', 'uchafu', 'magonjwa', 'ugonjwa', 'dalili'],
  why: ['why', 'reason', 'explain', 'kwa nini', 'kwanini', 'sababu', 'eleza'],
  todo: ['what should', 'what do i', 'what to do', 'advice', 'action', 'recommend', 'nifanye', 'ushauri', 'hatua', 'nini cha kufanya', 'shauri'],
  harvest: ['harvest', 'mavuno', 'kuvuna', 'vuna', 'mature', 'kukomaa'],
  env: ['weather', 'sea', 'temperature', 'wave', 'wind', 'rain', 'ocean', 'hali ya hewa', 'bahari', 'joto', 'mawimbi', 'upepo', 'mvua'],
  history: ['history', 'historia', 'past', 'previous', 'zamani', 'rekodi zangu', 'last harvest'],
  risk: ['risk', 'hatari', 'danger', 'status', 'hali'],
  greet: ['hello', 'hi ', 'hey', 'habari', 'mambo', 'jambo', 'salaam', 'shikamoo'],
};

export function detectIntent(message) {
  const t = ` ${message.toLowerCase()} `;
  if (has(t, KW.treatment)) return 'TREATMENT';
  if (has(t, KW.report) && has(t, KW.symptom)) return 'RECORD_OBSERVATION';
  if (has(t, KW.why)) return 'WHY_RISK';
  if (has(t, KW.todo)) return 'WHAT_TO_DO';
  if (has(t, KW.harvest)) return 'HARVEST';
  if (has(t, KW.env)) return 'ENVIRONMENT';
  if (has(t, KW.history)) return 'HISTORY';
  if (has(t, KW.risk)) return 'RISK_STATUS';
  if (has(t, KW.greet)) return 'GREETING';
  return 'UNKNOWN';
}

export function detectLanguage(message) {
  const t = message.toLowerCase();
  const sw = ['nini', 'kwa', 'yangu', 'hatari', 'mwani', 'shamba', 'nifanye', 'habari', 'naona', 'mavuno', 'lini', 'je', 'ni ', 'iko', 'sana', 'ushauri'];
  return sw.filter((w) => t.includes(w)).length >= 1 ? 'sw' : 'en';
}

/** Natural language → structured observation draft (the farmer confirms before it is saved). */
export function parseObservation(message) {
  const t = message.toLowerCase();
  const pct = t.match(/(\d{1,3})\s*(%|percent|asilimia)/) || t.match(/asilimia\s*(\d{1,3})/);
  const whitening = has(t, ['whit', 'bleach', 'weupe', 'nyeupe', 'meupe', 'rangi']);
  const breakage = has(t, ['break', 'broke', 'kukatika', 'imekatika', 'katika']);
  const epiphytes = has(t, ['epiphyt', 'uchafu', 'majani mengine']);
  const poor = has(t, ['poor', 'bad', 'dying', 'mbaya', 'inakufa']);
  return {
    cropCondition: poor || (pct && Number(pct[1]) >= 30) ? 'POOR' : whitening || breakage || epiphytes ? 'FAIR' : 'GOOD',
    whitening,
    breakage,
    epiphytes,
    diseaseSymptoms: whitening,
    unusualGrowth: false,
    percentAffected: pct ? Math.min(100, Number(pct[1])) : null,
    notes: `From assistant: "${message.slice(0, 300)}"`,
    confidence: 'MEDIUM',
  };
}

const pct = (p) => `${Math.round(p * 100)}%`;
const riskLine = (p, lang) => `${RISK_LABELS[p.riskType][lang]}: ${LEVEL_LABELS[p.riskLevel][lang]} (${pct(p.probability)})`;

const SAFETY = {
  en: 'I can help you record the symptoms and show approved farm guidance. For treatment decisions, contact an extension officer.',
  sw: 'Ninaweza kukusaidia kurekodi dalili na kukuonyesha ushauri ulioidhinishwa. Kwa maamuzi ya matibabu, wasiliana na afisa ugani.',
};

async function resolveFarm(user, farmId) {
  if (farmId) {
    const farm = await prisma.farm.findFirst({ where: { AND: [{ id: farmId }, farmScope(user)] }, include: { species: true } });
    if (!farm) throw forbidden('You do not have access to this farm');
    return farm;
  }
  return prisma.farm.findFirst({ where: farmScope(user), include: { species: true }, orderBy: { farmCode: 'asc' } });
}

/**
 * AI Farmer Assistant. Answers ONLY from the farmer's own records, the risk engine's structured
 * factors and the Action Engine's approved recommendations. An optional LLM may rephrase the
 * answer, but never adds advice; treatment questions are always redirected to an extension officer.
 */
export const AssistantService = {
  async chat(user, { message, farmId, language }) {
    const lang = language || detectLanguage(message);
    const intent = detectIntent(message);
    const farm = await resolveFarm(user, farmId);
    const base = { intent, language: lang, farm: farm ? { id: farm.id, farmCode: farm.farmCode, name: farm.name } : null };

    if (intent === 'TREATMENT') {
      return { ...base, reply: SAFETY[lang], generatedBy: 'SAFETY_POLICY', approvedAction: null, facts: {} };
    }
    if (!farm) {
      return { ...base, reply: lang === 'sw' ? 'Bado huna shamba lililosajiliwa. Tafadhali ongeza shamba kwanza.' : 'You do not have a registered farm yet. Please add a farm first.', generatedBy: 'TEMPLATE', facts: {} };
    }

    let risk = await RiskService.latestForFarm(farm.id);
    if (!risk.predictions.length) risk = await RiskService.runForFarm(farm.id, { trigger: 'MANUAL' });
    const preds = risk.predictions;
    const top = [...preds].filter((p) => p.riskType !== 'HARVEST_WINDOW').sort((a, b) => b.probability - a.probability)[0];
    const next = risk.nextAction;
    const approvedAction = next?.recommendation?.actionItem ? { text: lang === 'sw' ? next.recommendation.actionItem.actionSw : next.recommendation.actionItem.action, riskType: next.riskType, source: next.recommendation.actionItem.source, validated: next.recommendation.actionItem.validated, recommendationId: next.recommendation.id } : null;
    const cycle = await prisma.plantingCycle.findFirst({ where: { farmId: farm.id, status: 'ACTIVE' }, orderBy: { plantingDate: 'desc' } });
    const facts = { risks: preds.map((p) => ({ riskType: p.riskType, level: p.riskLevel, probability: p.probability, confidence: p.confidence })), cropAgeDays: cycle ? cropAgeDays(cycle.plantingDate) : null };

    let reply;
    let observationDraft = null;
    switch (intent) {
      case 'RECORD_OBSERVATION': {
        observationDraft = parseObservation(message);
        const parts = [];
        if (observationDraft.whitening) parts.push(lang === 'sw' ? 'kubadilika rangi (weupe)' : 'whitening');
        if (observationDraft.breakage) parts.push(lang === 'sw' ? 'kukatika' : 'breakage');
        if (observationDraft.epiphytes) parts.push('epiphytes');
        const p = observationDraft.percentAffected != null ? ` (${observationDraft.percentAffected}%)` : '';
        reply = lang === 'sw'
          ? `Nimeelewa: ${parts.join(', ') || 'hali ya mwani'}${p}. Thibitisha ili kurekodi taarifa hii kwa shamba ${farm.farmCode}; mfumo utakokotoa hatari upya.`
          : `I understood: ${parts.join(', ') || 'crop condition'}${p}. Confirm to record this observation for ${farm.farmCode}; the risk engine will then recalculate.`;
        break;
      }
      case 'WHY_RISK': {
        if (!top) { reply = lang === 'sw' ? 'Bado hakuna utabiri wa hatari kwa shamba hili.' : 'There is no risk prediction for this farm yet.'; break; }
        const reasons = top.factors.filter((f) => f.direction === 'INCREASES').slice(0, 3).map((f) => (lang === 'sw' ? f.labelSw : f.label));
        facts.factors = top.factors.slice(0, 5);
        reply = lang === 'sw'
          ? `${riskLine(top, 'sw')}. ${reasons.length ? `Sababu: ${reasons.join('; ')}.` : 'Hakuna sababu kubwa za hatari kwa sasa.'}`
          : `${riskLine(top, 'en')}. ${reasons.length ? `Reasons: ${reasons.join('; ')}.` : 'There are no strong risk signals right now.'}`;
        break;
      }
      case 'WHAT_TO_DO':
        reply = approvedAction
          ? (lang === 'sw' ? `Hatua inayofuata: ${approvedAction.text}` : `Next action: ${approvedAction.text}`)
          : (risk.insufficientDataMessage?.[lang] || (lang === 'sw' ? 'Hakuna hatua mpya kwa sasa. Endelea kufuatilia shamba.' : 'No new action right now. Continue monitoring your farm.'));
        break;
      case 'HARVEST': {
        const hw = preds.find((p) => p.riskType === 'HARVEST_WINDOW');
        const fc = await prisma.harvestForecast.findFirst({ where: { farmId: farm.id, isCurrent: true } });
        const age = facts.cropAgeDays;
        const days = cycle ? daysBetween(new Date(), cycle.expectedHarvestDate) : null;
        const hwAction = hw?.recommendation?.actionItem;
        facts.forecast = fc ? { expectedHarvestDate: fc.expectedHarvestDate, riskAdjustedQuantityKg: fc.riskAdjustedQuantityKg, lowQuantityKg: fc.lowQuantityKg, highQuantityKg: fc.highQuantityKg } : null;
        if (!cycle) { reply = lang === 'sw' ? 'Hakuna mzunguko wa upandaji unaoendelea kwa shamba hili.' : 'There is no active planting cycle for this farm.'; break; }
        reply = lang === 'sw'
          ? `Mwani una siku ${age}. ${days > 0 ? `Mavuno yanatarajiwa baada ya siku ${days}.` : 'Umefikia muda wa kuvuna.'}${fc ? ` Makadirio: kg ${Math.round(fc.lowQuantityKg)}–${Math.round(fc.highQuantityKg)} (kavu).` : ''}${hwAction ? ` Ushauri: ${hwAction.actionSw}` : ''}`
          : `Your crop is ${age} days old. ${days > 0 ? `Harvest is expected in ${days} days.` : 'It has reached harvest time.'}${fc ? ` Estimate: ${Math.round(fc.lowQuantityKg)}–${Math.round(fc.highQuantityKg)} kg (dried).` : ''}${hwAction ? ` Guidance: ${hwAction.action}` : ''}`;
        break;
      }
      case 'ENVIRONMENT': {
        const env = await EnvironmentService.latestForFarm(farm.id);
        if (!env) { reply = lang === 'sw' ? 'Hakuna taarifa za mazingira bado.' : 'No environmental data yet.'; break; }
        facts.environment = { seaSurfaceTempC: env.seaSurfaceTempC, sstAnomalyC: env.sstAnomalyC, waveHeightM: env.waveHeightM, windSpeedKmh: env.windSpeedKmh, rainfallMm: env.rainfallMm, source: env.source };
        const tag = env.source === 'DEMO' ? (lang === 'sw' ? ' (taarifa za majaribio/demo)' : ' (demo data)') : env.source === 'CACHED' ? (lang === 'sw' ? ' (taarifa za awali)' : ' (cached data)') : '';
        reply = lang === 'sw'
          ? `Joto la bahari: ${env.seaSurfaceTempC}°C (${env.sstAnomalyC >= 0 ? '+' : ''}${env.sstAnomalyC}°C ya kawaida). Mawimbi: m ${env.waveHeightM}. Upepo: km/saa ${Math.round(env.windSpeedKmh)}. Mvua: mm ${env.rainfallMm}${tag}.`
          : `Sea temperature: ${env.seaSurfaceTempC}°C (${env.sstAnomalyC >= 0 ? '+' : ''}${env.sstAnomalyC}°C vs normal). Waves: ${env.waveHeightM} m. Wind: ${Math.round(env.windSpeedKmh)} km/h. Rain: ${env.rainfallMm} mm${tag}.`;
        break;
      }
      case 'HISTORY': {
        const [obs, harvests, losses] = await Promise.all([
          prisma.farmObservation.findMany({ where: { farmId: farm.id }, orderBy: { observedAt: 'desc' }, take: 3 }),
          prisma.harvestRecord.findMany({ where: { farmId: farm.id }, orderBy: { harvestDate: 'desc' }, take: 2 }),
          prisma.lossRecord.findMany({ where: { farmId: farm.id }, orderBy: { lossDate: 'desc' }, take: 2 }),
        ]);
        facts.history = { observations: obs.length, harvests: harvests.map((h) => ({ date: h.harvestDate, kg: h.actualQuantity })), losses: losses.map((l) => ({ date: l.lossDate, cause: l.cause, percent: l.percentLost })) };
        const d = (x) => new Date(x).toISOString().slice(0, 10);
        reply = lang === 'sw'
          ? `Ripoti za hivi karibuni: ${obs.length}. ${harvests.length ? `Mavuno ya mwisho: kg ${harvests[0].actualQuantity} (${d(harvests[0].harvestDate)}).` : 'Hakuna mavuno yaliyorekodiwa.'} ${losses.length ? `Hasara ya mwisho: ${losses[0].percentLost}% (${losses[0].cause}).` : ''}`.trim()
          : `Recent observations: ${obs.length}. ${harvests.length ? `Last harvest: ${harvests[0].actualQuantity} kg (${d(harvests[0].harvestDate)}).` : 'No harvests recorded.'} ${losses.length ? `Last loss: ${losses[0].percentLost}% (${losses[0].cause}).` : ''}`.trim();
        break;
      }
      case 'RISK_STATUS':
        reply = preds.length ? preds.map((p) => riskLine(p, lang)).join('. ') + '.' : (lang === 'sw' ? 'Bado hakuna utabiri.' : 'No prediction yet.');
        if (approvedAction) reply += lang === 'sw' ? ` Hatua: ${approvedAction.text}` : ` Action: ${approvedAction.text}`;
        break;
      case 'GREETING':
        reply = lang === 'sw'
          ? `Habari ${user.fullName.split(' ')[0]}! Uliza kuhusu hatari ya shamba lako, sababu zake, hatua ya kuchukua, mavuno au hali ya bahari.`
          : `Hello ${user.fullName.split(' ')[0]}! Ask me about your farm's risk, why it is high, what to do next, harvest timing or sea conditions.`;
        break;
      default:
        reply = lang === 'sw'
          ? 'Samahani, sijaelewa. Unaweza kuuliza: "Kwa nini hatari yangu iko juu?", "Nifanye nini?", "Lini nivune?", "Hali ya bahari ikoje?" au "Naona mwani mweupe".'
          : 'Sorry, I did not understand. You can ask: "Why is my risk high?", "What should I do?", "When should I harvest?", "What are sea conditions?" or "I see whitening on my seaweed".';
    }

    let generatedBy = 'TEMPLATE';
    if (llm.isLive && ['WHY_RISK', 'WHAT_TO_DO', 'HARVEST', 'ENVIRONMENT', 'RISK_STATUS'].includes(intent)) {
      try {
        const rephrased = await llm.generate({
          system: 'You are the MwaniMlinzi seaweed-farm assistant for Zanzibar farmers. Rephrase the given ANSWER in simple, friendly language. '
            + 'Use ONLY the facts in the ANSWER. Never add new farming advice, actions, treatments, chemicals, numbers or causes. '
            + 'If the ANSWER contains an action, keep its meaning exactly. Reply in '
            + (lang === 'sw' ? 'Kiswahili' : 'English') + ', maximum 80 words.',
          prompt: `QUESTION: ${message}\nANSWER: ${reply}`,
          maxTokens: 300,
        });
        if (rephrased) { reply = rephrased; generatedBy = `LLM:${llm.name}`; }
      } catch (err) {
        console.warn('[assistant] LLM unavailable, using template:', err.message);
      }
    }
    return { ...base, reply, generatedBy, approvedAction: ['WHAT_TO_DO', 'RISK_STATUS', 'WHY_RISK'].includes(intent) ? approvedAction : null, observationDraft, facts };
  },
};
