import prisma from '../config/prisma.js';
import { levelRank } from '../ai/constants.js';
import { RiskService } from './riskService.js';
import { RecordService } from './recordService.js';
import { SMSService } from './smsService.js';
import { normalizeTzPhone, maskPhone } from '../utils/phone.js';
import { formatDate } from '../utils/dates.js';
import { runInBackground } from '../utils/background.js';

/**
 * Africa's Talking USSD application.
 *
 * AT posts { sessionId, serviceCode, phoneNumber, networkCode, text } on every step, where `text` is the
 * full '*'-joined input path. The menu position, language, selected farm and temporary input are
 * persisted in `ussd_sessions`, so each request only consumes the newest input. Replies start with
 * "CON " (continue) or "END " (close the session).
 *
 * Idempotency: AT retries a request when our reply is slow. A request with the same sessionId and the
 * same `text` as the last processed one returns the stored reply without repeating side effects.
 */

export const USSD_SESSION_TTL_MS = 5 * 60 * 1000;
const MAX_SCREEN = 182; // characters AT/networks reliably show on one USSD screen
const MAX_KG = 100000;
const RISK_WAIT_MS = 6000; // answer within AT's timeout even if the risk engine is slow

const T = {
  sw: {
    notRegistered: 'Simu hii haijasajiliwa MwaniMlinzi. Tafadhali jisajili kwanza.',
    noFarm: 'Hakuna shamba lililosajiliwa kwa namba hii. Wasiliana na ushirika wako.',
    main: 'MwaniMlinzi\n1. Hatari ya Shamba\n2. Ripoti Dalili\n3. Mavuno\n4. Ushauri\n5. Lugha',
    invalid: 'Chaguo si sahihi.',
    back: '0. Rudi',
    pickFarm: 'Chagua shamba:',
    symptoms: 'Umeona nini?\n1. Mwani kuwa mweupe\n2. Kukatika\n3. Ukuaji hafifu\n4. Nyingine',
    harvestMenu: 'Mavuno\n1. Rekodi mavuno\n2. Makadirio ya mavuno',
    enterKg: 'Weka kilo za mwani mkavu uliovuna (mfano 120):',
    badKg: `Kiasi si sahihi. Weka namba kati ya 1 na ${MAX_KG}:`,
    confirmKg: (kg, farm) => `Thibitisha mavuno ya kg ${kg} kwa ${farm}?\n1. Ndiyo\n2. Hapana`,
    harvestSaved: (kg, farm) => `Asante. Mavuno ya kg ${kg} yamerekodiwa kwa ${farm}.`,
    harvestCancelled: 'Mavuno hayajarekodiwa.',
    language: 'Chagua lugha:\n1. Kiswahili\n2. English',
    languageSaved: 'Lugha imebadilishwa kuwa Kiswahili.',
    obsSaved: 'Asante. Ripoti yako imehifadhiwa.',
    obsProcessing: 'Tunachambua hatari. Utapokea SMS yenye ushauri.',
    risk: (farm, level, type) => `${farm}: ${level} (${type}).`,
    reason: 'Sababu',
    action: 'Hatua',
    noAction: 'Endelea kukagua shamba lako kila siku.',
    noForecast: 'Hakuna makadirio ya mavuno kwa sasa. Rekodi upandaji na hali ya shamba kwanza.',
    forecast: (farm, kg, date) => `${farm}: Mavuno yanayotarajiwa ni takriban kg ${kg} (mkavu) karibu ${date}.`,
    insufficient: 'Data haitoshi kutoa ushauri wa kuaminika. Ripoti hali ya shamba (chaguo 2).',
    expired: 'Muda wa kipindi umekwisha. Tafadhali piga tena.',
    error: 'Samahani, kuna hitilafu. Tafadhali jaribu tena baadaye.',
    level: { LOW: 'Hatari ndogo', MEDIUM: 'Hatari ya kati', HIGH: 'Hatari kubwa', CRITICAL: 'Hatari kubwa sana' },
    type: { HEAT_ICE_ICE: 'joto/ice-ice', STORM_LINE_DAMAGE: 'dhoruba', POOR_GROWTH: 'ukuaji hafifu' },
    smsObs: (farm, level, action) => `MWANIMLINZI: Ripoti ya ${farm} imepokelewa. ${level}.${action ? ` Hatua: ${action}` : ''}`,
    smsHarvest: (kg, farm) => `MWANIMLINZI: Mavuno ya kg ${kg} yamerekodiwa kwa ${farm}. Asante.`,
  },
  en: {
    notRegistered: 'This phone is not registered with MwaniMlinzi. Please register first.',
    noFarm: 'No farm is registered for this number. Please contact your cooperative.',
    main: 'MwaniMlinzi\n1. Farm risk\n2. Report symptoms\n3. Harvest\n4. Advice\n5. Language',
    invalid: 'Invalid choice.',
    back: '0. Back',
    pickFarm: 'Choose a farm:',
    symptoms: 'What did you see?\n1. Whitening\n2. Breakage\n3. Slow growth\n4. Other',
    harvestMenu: 'Harvest\n1. Record harvest\n2. Expected harvest',
    enterKg: 'Enter kg of dry seaweed harvested (e.g. 120):',
    badKg: `Invalid amount. Enter a number from 1 to ${MAX_KG}:`,
    confirmKg: (kg, farm) => `Confirm harvest of ${kg} kg for ${farm}?\n1. Yes\n2. No`,
    harvestSaved: (kg, farm) => `Thank you. Harvest of ${kg} kg recorded for ${farm}.`,
    harvestCancelled: 'Harvest not recorded.',
    language: 'Choose language:\n1. Kiswahili\n2. English',
    languageSaved: 'Language changed to English.',
    obsSaved: 'Thank you. Your report has been saved.',
    obsProcessing: 'We are checking the risk. You will receive advice by SMS.',
    risk: (farm, level, type) => `${farm}: ${level} (${type}).`,
    reason: 'Why',
    action: 'Action',
    noAction: 'Keep checking your farm every day.',
    noForecast: 'No harvest estimate yet. Record planting and farm condition first.',
    forecast: (farm, kg, date) => `${farm}: Expected harvest is about ${kg} kg (dry) around ${date}.`,
    insufficient: 'Not enough data to give reliable advice. Report your farm condition (option 2).',
    expired: 'Your session has expired. Please dial again.',
    error: 'Sorry, something went wrong. Please try again later.',
    level: { LOW: 'Low risk', MEDIUM: 'Medium risk', HIGH: 'High risk', CRITICAL: 'Very high risk' },
    type: { HEAT_ICE_ICE: 'heat/ice-ice', STORM_LINE_DAMAGE: 'storm', POOR_GROWTH: 'slow growth' },
    smsObs: (farm, level, action) => `MWANIMLINZI: Report for ${farm} received. ${level}.${action ? ` Action: ${action}` : ''}`,
    smsHarvest: (kg, farm) => `MWANIMLINZI: Harvest of ${kg} kg recorded for ${farm}. Thank you.`,
  },
};

const SYMPTOMS = {
  1: { whitening: true, diseaseSymptoms: true, cropCondition: 'FAIR', note: 'whitening' },
  2: { breakage: true, cropCondition: 'FAIR', note: 'breakage' },
  3: { unusualGrowth: true, growthCondition: 'SLOW', cropCondition: 'FAIR', note: 'slow growth' },
  4: { cropCondition: 'FAIR', note: 'other symptom' },
};

/** Keep a reply on one screen: shorten the last line (usually the action text) if needed. */
export function fitScreen(text, max = MAX_SCREEN) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

const con = (text) => ({ text, end: false });
const end = (text) => ({ text, end: true });

async function findUser(phone) {
  if (!phone) return null;
  return prisma.user.findFirst({
    where: { phone, isActive: true },
    include: { farmer: { include: { farms: { where: { status: { not: 'INACTIVE' } }, orderBy: { farmCode: 'asc' }, select: { id: true, farmCode: true, name: true } } } } },
  });
}

async function currentRisk(farmId) {
  const r = await RiskService.latestForFarm(farmId);
  if (r.predictions.length) return r;
  return RiskService.runForFarm(farmId, { trigger: 'MANUAL', refreshEnvironment: false });
}

/** The most important of the three crop risks (the harvest window is not a "risk" for farmers). */
function mainRisk(risk) {
  return risk.predictions
    .filter((p) => p.riskType !== 'HARVEST_WINDOW' && !p.insufficientData)
    .sort((a, b) => levelRank(b.riskLevel) - levelRank(a.riskLevel) || b.probability - a.probability)[0] || null;
}

function reasonFor(prediction, lang) {
  const f = (prediction?.factors || []).find((x) => x.direction === 'INCREASES' && x.simpleLabel);
  return f ? (lang === 'en' ? f.simpleLabel : f.simpleLabelSw) : null;
}

function actionText(risk, lang) {
  const a = risk.nextAction?.recommendation?.actionItem;
  if (!a) return null;
  return lang === 'en' ? a.action : a.actionSw;
}

function riskScreen(farm, risk, lang) {
  const t = T[lang];
  const main = mainRisk(risk);
  if (!main) return end(`${farm.farmCode}: ${t.insufficient}`);
  const lines = [t.risk(farm.farmCode, t.level[main.riskLevel], t.type[main.riskType])];
  const reason = reasonFor(main, lang);
  if (reason) lines.push(`${t.reason}: ${reason}.`);
  const action = actionText(risk, lang);
  lines.push(`${t.action}: ${action || t.noAction}`);
  return end(fitScreen(lines.join('\n')));
}

function adviceScreen(farm, risk, lang) {
  const t = T[lang];
  const action = actionText(risk, lang);
  if (action) return end(fitScreen(`${farm.farmCode}\n${t.action}: ${action}`));
  if (risk.insufficientDataMessage || !mainRisk(risk)) return end(`${farm.farmCode}: ${t.insufficient}`);
  return end(`${farm.farmCode}: ${t.noAction}`);
}

async function forecastScreen(farm, lang) {
  const t = T[lang];
  const fc = await prisma.harvestForecast.findFirst({ where: { farmId: farm.id, isCurrent: true }, orderBy: { createdAt: 'desc' } });
  if (!fc) return end(t.noForecast);
  return end(t.forecast(farm.farmCode, Math.round(fc.riskAdjustedQuantityKg), formatDate(fc.expectedHarvestDate)));
}

function farmMenu(farms, lang) {
  return con(fitScreen(`${T[lang].pickFarm}\n${farms.map((f, i) => `${i + 1}. ${f.farmCode} ${f.name}`).join('\n')}\n${T[lang].back}`));
}

/** Records the observation, re-runs the risk engine (bounded wait) and confirms by SMS. */
async function reportSymptom(user, farm, choice, lang) {
  const t = T[lang];
  const s = SYMPTOMS[choice];
  const { note, ...data } = s;
  await RecordService.createObservation(farm.id, user, {
    whitening: false, breakage: false, epiphytes: false, diseaseSymptoms: false, unusualGrowth: false,
    ...data, notes: `USSD: ${note}`, confidence: 'MEDIUM',
  }, { channel: 'USSD', runRisk: false });

  const riskRun = RiskService.runForFarm(farm.id, { trigger: 'OBSERVATION', refreshEnvironment: false });
  runInBackground(riskRun.then((risk) => {
    const main = mainRisk(risk);
    const level = main ? T[lang].level[main.riskLevel] : T[lang].insufficient;
    return SMSService.sendToUser(user, {
      type: 'OBSERVATION_CONFIRMATION',
      text: {
        en: T.en.smsObs(farm.farmCode, main ? T.en.level[main.riskLevel] : T.en.insufficient, actionText(risk, 'en')),
        sw: T.sw.smsObs(farm.farmCode, main ? T.sw.level[main.riskLevel] : T.sw.insufficient, actionText(risk, 'sw')),
      },
    }).then(() => level);
  }));

  const risk = await Promise.race([riskRun, new Promise((r) => setTimeout(r, RISK_WAIT_MS, null).unref?.())]).catch(() => null);
  if (!risk) return end(`${t.obsSaved}\n${t.obsProcessing}`);
  const main = mainRisk(risk);
  const action = actionText(risk, lang);
  const lines = [t.obsSaved];
  if (main) lines.push(`${farm.farmCode}: ${t.level[main.riskLevel]} (${t.type[main.riskType]}).`);
  if (action) lines.push(`${t.action}: ${action}`);
  return end(fitScreen(lines.join('\n')));
}

async function recordHarvest(user, farm, kg, lang) {
  await RecordService.createHarvest(farm.id, { harvestDate: new Date(), actualQuantity: kg, unit: 'KG_DRY', closeCycle: false, notes: 'Recorded via USSD' }, { channel: 'USSD' });
  runInBackground(SMSService.sendToUser(user, {
    type: 'HARVEST_CONFIRMATION',
    text: { en: T.en.smsHarvest(kg, farm.farmCode), sw: T.sw.smsHarvest(kg, farm.farmCode) },
  }));
  return end(T[lang].harvestSaved(kg, farm.farmCode));
}

/** Parse a kg amount: digits with an optional decimal part (',' or '.'). */
export function parseKg(input) {
  if (!/^\d{1,6}([.,]\d{1,2})?$/.test(String(input || '').trim())) return null;
  const kg = Number(String(input).trim().replace(',', '.'));
  return kg > 0 && kg <= MAX_KG ? kg : null;
}

/**
 * One state-machine step. `state` = { menu, farmId, temp, language }; returns { reply:{text,end}, state }.
 * Menus: MAIN, FARM, SYMPTOM, HARVEST, HARVEST_KG, HARVEST_CONFIRM, LANGUAGE.
 */
async function step(user, farms, state, input) {
  let lang = state.language;
  const t = () => T[lang];
  const farmById = (id) => farms.find((f) => f.id === id) || null;
  const next = (menu, patch = {}) => ({ ...state, menu, ...patch });

  // Runs a main-menu option once a farm is known.
  const runOption = async (option, farm) => {
    switch (option) {
      case '1': return { reply: riskScreen(farm, await currentRisk(farm.id), lang), state: next('DONE', { farmId: farm.id }) };
      case '2': return { reply: con(t().symptoms), state: next('SYMPTOM', { farmId: farm.id }) };
      case '3': return { reply: con(t().harvestMenu), state: next('HARVEST', { farmId: farm.id }) };
      case '4': return { reply: adviceScreen(farm, await currentRisk(farm.id), lang), state: next('DONE', { farmId: farm.id }) };
      default: return { reply: con(`${t().invalid}\n${t().main}`), state: next('MAIN') };
    }
  };

  if (input === '0' && state.menu !== 'MAIN') return { reply: con(t().main), state: next('MAIN', { temp: {} }) };

  switch (state.menu) {
    case 'MAIN': {
      if (input === '5') return { reply: con(t().language), state: next('LANGUAGE') };
      if (!['1', '2', '3', '4'].includes(input)) return { reply: con(`${t().invalid}\n${t().main}`), state };
      if (farms.length === 1) return runOption(input, farms[0]);
      return { reply: farmMenu(farms, lang), state: next('FARM', { temp: { option: input } }) };
    }
    case 'FARM': {
      const farm = farms[Number(input) - 1];
      if (!/^\d+$/.test(input) || !farm) return { reply: con(`${t().invalid}\n${farmMenu(farms, lang).text}`), state };
      return runOption(state.temp?.option, farm);
    }
    case 'SYMPTOM': {
      const farm = farmById(state.farmId);
      if (!SYMPTOMS[input] || !farm) return { reply: con(`${t().invalid}\n${t().symptoms}`), state };
      return { reply: await reportSymptom(user, farm, input, lang), state: next('DONE') };
    }
    case 'HARVEST': {
      const farm = farmById(state.farmId);
      if (input === '1') return { reply: con(t().enterKg), state: next('HARVEST_KG', { temp: { attempts: 0 } }) };
      if (input === '2' && farm) return { reply: await forecastScreen(farm, lang), state: next('DONE') };
      return { reply: con(`${t().invalid}\n${t().harvestMenu}`), state };
    }
    case 'HARVEST_KG': {
      const kg = parseKg(input);
      if (kg == null) {
        const attempts = (state.temp?.attempts || 0) + 1;
        if (attempts >= 3) return { reply: end(t().harvestCancelled), state: next('DONE') };
        return { reply: con(t().badKg), state: next('HARVEST_KG', { temp: { attempts } }) };
      }
      return { reply: con(t().confirmKg(kg, farmById(state.farmId)?.farmCode || '')), state: next('HARVEST_CONFIRM', { temp: { kg } }) };
    }
    case 'HARVEST_CONFIRM': {
      const farm = farmById(state.farmId);
      if (input === '1' && farm && state.temp?.kg) return { reply: await recordHarvest(user, farm, state.temp.kg, lang), state: next('DONE') };
      if (input === '2') return { reply: end(t().harvestCancelled), state: next('DONE') };
      return { reply: con(`${t().invalid}\n${t().confirmKg(state.temp?.kg, farm?.farmCode || '')}`), state };
    }
    case 'LANGUAGE': {
      if (input !== '1' && input !== '2') return { reply: con(`${t().invalid}\n${t().language}`), state };
      lang = input === '1' ? 'sw' : 'en';
      await prisma.user.update({ where: { id: user.id }, data: { preferredLanguage: lang } });
      return { reply: con(`${T[lang].languageSaved}\n${T[lang].main}`), state: next('MAIN', { language: lang }) };
    }
    default:
      return { reply: end(t().expired), state: next('DONE') };
  }
}

const format = ({ text, end: isEnd }) => `${isEnd ? 'END' : 'CON'} ${text}`;

export const UssdService = {
  T,

  /**
   * Process one Africa's Talking USSD request.
   * @returns { response: 'CON …'|'END …', end, menu, duplicate, userId }
   */
  async handle({ sessionId, phoneNumber, serviceCode = null, networkCode = null, text = '' }) {
    const phone = normalizeTzPhone(phoneNumber);
    const input = String(text ?? '');
    const existing = await prisma.ussdSession.findUnique({ where: { sessionId } });

    // Duplicate delivery (AT retry): same session + same path → same answer, no side effects.
    if (existing && existing.lastResponse && existing.lastInput === input && existing.requestCount > 0) {
      return { response: existing.lastResponse, end: existing.lastResponse.startsWith('END'), menu: existing.currentMenu, duplicate: true, userId: existing.userId };
    }
    if (existing && existing.phoneNumber !== (phone || phoneNumber)) {
      return { response: `END ${T.sw.error}`, end: true, menu: 'REJECTED', duplicate: false, userId: null };
    }

    const save = async (reply, state, userId, status) => {
      const response = format(reply);
      const data = {
        lastInput: input, lastResponse: response, currentMenu: state.menu, farmId: state.farmId || null,
        tempData: state.temp || {}, language: state.language || null, status, userId, serviceCode, networkCode,
      };
      await prisma.ussdSession.upsert({
        where: { sessionId },
        update: { ...data, requestCount: { increment: 1 } },
        create: { sessionId, phoneNumber: phone || String(phoneNumber || ''), ...data, requestCount: 1 },
      });
      return { response, end: reply.end, menu: state.menu, duplicate: false, userId };
    };

    if (existing && (existing.status !== 'ACTIVE' || Date.now() - existing.updatedAt.getTime() > USSD_SESSION_TTL_MS)) {
      const lang = existing.language || 'sw';
      return save(end(T[lang].expired), { menu: 'EXPIRED', language: lang }, existing.userId, 'EXPIRED');
    }

    const user = await findUser(phone);
    if (!user) return save(end(T.sw.notRegistered), { menu: 'UNREGISTERED' }, null, 'ENDED');
    const farms = user.farmer?.farms || [];
    const lang0 = existing?.language || (user.preferredLanguage === 'en' ? 'en' : 'sw');
    if (!farms.length) return save(end(T[lang0].noFarm), { menu: 'NO_FARM', language: lang0 }, user.id, 'ENDED');

    // A new session (or AT's first request with empty text) shows the main menu.
    if (!existing || input === '') {
      return save(con(T[lang0].main), { menu: 'MAIN', language: lang0, temp: {} }, user.id, 'ACTIVE');
    }

    const latest = input.split('*').pop().trim();
    const state = { menu: existing.currentMenu, farmId: existing.farmId, temp: existing.tempData || {}, language: lang0 };
    try {
      const { reply, state: nextState } = await step(user, farms, state, latest);
      return save(reply, nextState, user.id, reply.end ? 'ENDED' : 'ACTIVE');
    } catch (err) {
      console.warn(`[ussd] step failed for ${maskPhone(phone)}:`, err.message);
      return save(end(T[lang0].error), { ...state, menu: 'ERROR' }, user.id, 'ENDED');
    }
  },

  /** Mark stale ACTIVE sessions as EXPIRED (called by the cleanup job). */
  async expireStale(now = new Date()) {
    const { count } = await prisma.ussdSession.updateMany({
      where: { status: 'ACTIVE', updatedAt: { lt: new Date(now.getTime() - USSD_SESSION_TTL_MS) } },
      data: { status: 'EXPIRED' },
    });
    return count;
  },
};

