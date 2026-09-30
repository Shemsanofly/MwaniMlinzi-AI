import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import prisma from '../config/prisma.js';
import { levelRank } from '../ai/constants.js';
import { RiskService } from './riskService.js';
import { RecordService } from './recordService.js';
import { SMSService } from './smsService.js';
import { normalizeTzPhone, maskPhone } from '../utils/phone.js';
import { runInBackground } from '../utils/background.js';
import { addDays, startOfDay } from '../utils/dates.js';
import { SeaOutlookService } from './seaOutlookService.js';

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
    notRegistered: 'Namba hii haijasajiliwa MwaniMlinzi. Tafadhali jisajili kwanza.',
    noFarm: 'Hakuna shamba lililosajiliwa kwa namba hii. Wasiliana na ushirika wako.',
    enterName: 'Ingiza jina lako kamili:',
    enterOtherLocation: 'Ingiza jina la eneo lako:',
    location: 'Chagua eneo\n1. Paje\n2. Jambiani\n3. Kiwani\n4. Nyingine',
    species: (items) => `Chagua aina ya mwani\n${items}`,
    enterLines: 'Weka idadi ya mistari ya shamba (andika 0 kama hujui):',
    badName: 'Jina si sahihi. Ingiza jina lako kamili:',
    badLines: 'Idadi si sahihi. Weka namba 0 hadi 100000:',
    registered: 'Umesajiliwa MwaniMlinzi.',
    main: 'MWANIMLINZI\n1. Hali ya shamba\n2. Tahadhari\n3. Ripoti tatizo\n4. Rekodi mavuno\n5. Msaada',
    statusMenu: 'Hali ya shamba\n1. Hatari na hatua\n2. Maji kupwa na kukausha',
    helpMenu: 'Msaada\n1. Ushauri\n2. Lugha\n3. Kuhusu huduma',
    about: 'MwaniMlinzi hutumia utabiri wa bahari na hali ya hewa pamoja na ripoti zako kukupa ushauri wa shamba kutoka orodha maalum ya hatua. Huduma ni bure kwa wakulima.',
    consent: 'Taarifa za shamba lako zitatumika kukupa ushauri na kuboresha huduma.\n1. Nakubali\n2. Sikubali',
    consentDeclined: 'Hujasajiliwa. Hakuna taarifa zilizohifadhiwa.',
    alertsTitle: 'Tahadhari',
    noAlerts: 'Hakuna tahadhari mpya kwa mashamba yako.',
    noOutlook: 'Hakuna utabiri wa bahari kwa shamba hili bado.',
    lowTide: 'Maji kupwa',
    work: 'muda wa kazi',
    today: 'leo',
    tomorrow: 'kesho',
    noDaylightLow: 'hakuna maji kupwa mchana',
    dryingToday: 'Kukausha leo',
    verdict: { GOOD: 'NZURI', CAUTION: 'TAHADHARI', BAD: 'MBAYA' },
    invalid: 'Chaguo si sahihi.',
    back: '0. Rudi',
    pickFarm: 'Chagua shamba',
    symptoms: 'Umeona nini?\n1. Mwani kuwa mweupe\n2. Kukatika\n3. Ukuaji hafifu\n4. Nyingine',
    enterKg: 'Ingiza kiasi cha mavuno kwa kilo (mwani mkavu, mfano 120):',
    badKg: `Kiasi si sahihi. Weka namba kati ya 1 na ${MAX_KG}:`,
    confirmKg: (kg, farm) => `Thibitisha mavuno ya kg ${kg} kwa ${farm}?\n1. Ndiyo\n2. Hapana`,
    harvestSaved: (kg, farm) => `Asante. Mavuno ya kg ${kg} yamerekodiwa kwa ${farm}.`,
    harvestCancelled: 'Mavuno hayajarekodiwa.',
    language: 'Chagua lugha:\n1. Kiswahili\n2. English',
    chooseLanguage: 'MWANIMLINZI\n1. Kiswahili\n2. English',
    languageSaved: 'Lugha imebadilishwa kuwa Kiswahili.',
    obsSaved: 'Asante. Ripoti yako imehifadhiwa.',
    obsProcessing: 'Tunachambua hatari. Utapokea SMS yenye ushauri.',
    riskLabel: 'Hatari',
    reason: 'Kwa nini',
    action: 'Hatua',
    noAction: 'Endelea kukagua shamba lako kila siku.',
    insufficient: 'Data haitoshi kutoa ushauri wa kuaminika. Ripoti hali ya shamba (chaguo 3).',
    expired: 'Muda wa kipindi umekwisha. Tafadhali piga tena.',
    error: 'Samahani, kuna tatizo. Tafadhali jaribu tena.',
    level: { LOW: 'Hatari ndogo', MEDIUM: 'Hatari ya kati', HIGH: 'Hatari kubwa', CRITICAL: 'Hatari kubwa sana' },
    levelShort: { LOW: 'NDOGO', MEDIUM: 'YA KATI', HIGH: 'KUBWA', CRITICAL: 'KUBWA SANA' },
    type: { HEAT_ICE_ICE: 'joto/ice-ice', STORM_LINE_DAMAGE: 'dhoruba', POOR_GROWTH: 'ukuaji hafifu' },
    smsObs: (farm, level, action) => `MWANIMLINZI: Ripoti ya ${farm} imepokelewa. ${level}.${action ? ` Hatua: ${action}` : ''}`,
    smsHarvest: (kg, farm) => `MWANIMLINZI: Mavuno ya kg ${kg} yamerekodiwa kwa ${farm}. Asante.`,
  },
  en: {
    notRegistered: 'This phone number is not registered with MwaniMlinzi. Please register first.',
    noFarm: 'No farm is registered for this number. Please contact your cooperative.',
    enterName: 'Enter your full name:',
    enterOtherLocation: 'Enter your location name:',
    location: 'Choose location\n1. Paje\n2. Jambiani\n3. Kiwani\n4. Other',
    species: (items) => `Choose seaweed type\n${items}`,
    enterLines: 'Enter farm line count (enter 0 if unknown):',
    badName: 'Invalid name. Enter your full name:',
    badLines: 'Invalid line count. Enter a number from 0 to 100000:',
    registered: 'You are registered with MwaniMlinzi.',
    main: 'MWANIMLINZI\n1. Farm status\n2. Alerts\n3. Report a problem\n4. Record harvest\n5. Help',
    statusMenu: 'Farm status\n1. Risk and action\n2. Low tide and drying',
    helpMenu: 'Help\n1. Advice\n2. Language\n3. About the service',
    about: 'MwaniMlinzi uses ocean and weather forecasts with your reports to give farm advice from a fixed list of actions. The service is free for farmers.',
    consent: 'Your farm information will be used to give you advice and improve the service.\n1. I agree\n2. I do not agree',
    consentDeclined: 'You are not registered. No information was saved.',
    alertsTitle: 'Alerts',
    noAlerts: 'No new alerts for your farms.',
    noOutlook: 'No sea forecast for this farm yet.',
    lowTide: 'Low tide',
    work: 'work time',
    today: 'today',
    tomorrow: 'tomorrow',
    noDaylightLow: 'none in daylight',
    dryingToday: 'Drying today',
    verdict: { GOOD: 'GOOD', CAUTION: 'CAUTION', BAD: 'BAD' },
    invalid: 'Invalid choice.',
    back: '0. Back',
    pickFarm: 'Choose a farm',
    symptoms: 'What did you see?\n1. Whitening\n2. Breakage\n3. Slow growth\n4. Other',
    enterKg: 'Enter the harvest amount in kg (dry seaweed, e.g. 120):',
    badKg: `Invalid amount. Enter a number from 1 to ${MAX_KG}:`,
    confirmKg: (kg, farm) => `Confirm harvest of ${kg} kg for ${farm}?\n1. Yes\n2. No`,
    harvestSaved: (kg, farm) => `Thank you. Harvest of ${kg} kg recorded for ${farm}.`,
    harvestCancelled: 'Harvest not recorded.',
    language: 'Choose language:\n1. Kiswahili\n2. English',
    chooseLanguage: 'MWANIMLINZI\n1. Kiswahili\n2. English',
    languageSaved: 'Language changed to English.',
    obsSaved: 'Thank you. Your report has been saved.',
    obsProcessing: 'We are checking the risk. You will receive advice by SMS.',
    riskLabel: 'Risk',
    reason: 'Why',
    action: 'Action',
    noAction: 'Keep checking your farm every day.',
    insufficient: 'Not enough data to give reliable advice. Report your farm condition (option 3).',
    expired: 'Your session has expired. Please dial again.',
    error: 'Sorry, something went wrong. Please try again.',
    level: { LOW: 'Low risk', MEDIUM: 'Medium risk', HIGH: 'High risk', CRITICAL: 'Very high risk' },
    levelShort: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' },
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

const USSD_LOCATIONS = {
  1: { locationName: 'Paje', district: 'Kusini', region: 'Unguja South', latitude: -6.268, longitude: 39.545 },
  2: { locationName: 'Jambiani', district: 'Kusini', region: 'Unguja South', latitude: -6.318, longitude: 39.552 },
  3: { locationName: 'Kiwani', district: 'Mkoani', region: 'Pemba South', latitude: -5.405, longitude: 39.628 },
};
const DEFAULT_LOCATION = USSD_LOCATIONS[1];

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

/** "Hatari: KUBWA (joto/ice-ice)" — the level in plain words, never a probability. */
const riskLine = (main, lang) => `${T[lang].riskLabel}: ${T[lang].levelShort[main.riskLevel]} (${T[lang].type[main.riskType]})`;

function riskScreen(farm, risk, lang) {
  const t = T[lang];
  const main = mainRisk(risk);
  if (!main) return end(`${farm.farmCode}: ${t.insufficient}`);
  const lines = [farm.farmCode, riskLine(main, lang)];
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

/** "Maji kupwa: leo 11:00 (kazi 10:00-13:00)" + today's drying verdict and approved advice, from the stored forecast. */
async function outlookScreen(farmRow, lang) {
  const t = T[lang];
  const farm = await prisma.farm.findUnique({ where: { id: farmRow.id }, include: { location: true } });
  const o = await SeaOutlookService.currentForFarm(farm, { refresh: false }); // stored result only: never wait on a live fetch
  if (!o) return end(`${farmRow.farmCode}: ${t.noOutlook}`);
  const lines = [farmRow.farmCode];
  const w = o.today.nextWorkWindow;
  if (w) {
    const day = w.time.slice(0, 10) === o.today.date ? t.today : t.tomorrow;
    lines.push(`${t.lowTide}: ${day} ${w.time.slice(11)} (${t.work} ${w.window.start.slice(11)}-${w.window.end.slice(11)})`);
  } else if (o.tides.length) lines.push(`${t.lowTide}: ${t.noDaylightLow}`);
  const dry = o.today.drying;
  if (dry?.verdict) {
    lines.push(`${t.dryingToday}: ${t.verdict[dry.verdict]}`);
    const advice = o.today.advice;
    if (advice) lines.push(lang === 'en' ? advice.action : advice.actionSw);
  }
  if (lines.length === 1) return end(`${farmRow.farmCode}: ${t.noOutlook}`);
  return end(fitScreen(lines.join('\n')));
}

/** Newest unresolved, real (non-simulation) alerts across the caller's farms. */
async function alertsScreen(farms, lang) {
  const t = T[lang];
  const alerts = await prisma.alert.findMany({
    where: { farmId: { in: farms.map((f) => f.id) }, isSimulation: false, status: { not: 'RESOLVED' } },
    orderBy: { createdAt: 'desc' },
    take: 3,
  });
  if (!alerts.length) return end(t.noAlerts);
  return end(fitScreen([t.alertsTitle, ...alerts.map((a) => `- ${lang === 'en' ? a.title : a.titleSw}`)].join('\n')));
}

function farmMenu(farms, lang) {
  return con(fitScreen(`${T[lang].pickFarm}\n${farms.map((f, i) => `${i + 1}. ${f.farmCode} ${f.name}`).join('\n')}\n${T[lang].back}`));
}

async function speciesMenu(lang) {
  const species = (await prisma.seaweedSpecies.findMany()).sort((a, b) => {
    const order = ['KAPPA', 'EUCH'];
    return (order.indexOf(a.code) === -1 ? 99 : order.indexOf(a.code)) - (order.indexOf(b.code) === -1 ? 99 : order.indexOf(b.code)) || a.commonName.localeCompare(b.commonName);
  });
  const items = species.map((s, i) => `${i + 1}. ${lang === 'en' ? s.commonName : s.commonNameSw}`).join('\n');
  return { reply: con(fitScreen(T[lang].species(items))), species };
}

function parseLineCount(input) {
  if (!/^\d{1,6}$/.test(String(input || '').trim())) return null;
  const n = Number(input);
  return n >= 0 && n <= MAX_KG ? n : null;
}

async function nextFarmCode(tx) {
  const count = await tx.farm.count();
  for (let n = count + 1; n < count + 1000; n += 1) {
    const code = `FARM${String(n).padStart(3, '0')}`;
    if (!(await tx.farm.findUnique({ where: { farmCode: code }, select: { id: true } }))) return code;
  }
  return `FARM-${Date.now()}`;
}

async function createUssdFarmer(phone, state) {
  if (!phone) throw new Error('USSD phone number is invalid');
  const [role, species] = await Promise.all([
    prisma.role.findUnique({ where: { name: 'FARMER' } }),
    prisma.seaweedSpecies.findUnique({ where: { id: state.temp.speciesId } }),
  ]);
  if (!role) throw new Error('FARMER role is not seeded');
  if (!species) throw new Error('Seaweed species is not configured');
  const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 12);
  const fullName = state.temp.name;
  const location = state.temp.location || DEFAULT_LOCATION;
  const enteredLines = state.temp.lineCount;
  const lineCount = enteredLines > 0 ? enteredLines : 1;
  const plantingDate = startOfDay();

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: null,
        passwordHash,
        fullName,
        phone,
        preferredLanguage: state.language || 'sw',
        smsEnabled: true,
        consentGiven: true,
        consentAt: state.temp.consentAt ? new Date(state.temp.consentAt) : new Date(),
        roles: { create: { roleId: role.id } },
      },
    });
    const farmer = await tx.farmer.create({
      data: {
        userId: user.id,
        farmerCode: `FMR-USSD-${user.id.slice(0, 8).toUpperCase()}`,
        village: location.locationName,
        district: location.district,
        region: location.region,
      },
    });
    const farmCode = await nextFarmCode(tx);
    const farm = await tx.farm.create({
      data: {
        farmCode,
        name: `USSD ${location.locationName}`,
        farmerId: farmer.id,
        speciesId: species.id,
        farmingMethod: 'OFF_BOTTOM',
        exposure: 'MODERATE',
        anchoringMethod: 'WOODEN_STAKES',
        lineCount,
        notes: [
          enteredLines === 0 ? 'Created by USSD onboarding; line count unknown.' : 'Created by USSD onboarding.',
          location.unmapped ? `Location "${location.locationName}" has no map point yet — set it so live weather/ocean data can be used.` : null,
        ].filter(Boolean).join(' '),
        ...(location.unmapped ? {} : { location: { create: location } }),
      },
    });
    await tx.plantingCycle.create({
      data: {
        farmId: farm.id,
        plantingDate,
        expectedHarvestDate: addDays(plantingDate, species.typicalCycleDays),
        linesPlanted: lineCount,
        seedQuantityKg: null,
        notes: 'Started by USSD onboarding.',
      },
    });
    return { userId: user.id, farmCode };
  });
}

async function stepOnboarding(phone, state, input) {
  let lang = state.language || 'sw';
  const t = () => T[lang];
  const next = (menu, patch = {}) => ({ ...state, menu, language: lang, ...patch });

  switch (state.menu) {
    case 'ONBOARD_LANGUAGE': {
      if (input !== '1' && input !== '2') return { reply: con(`${T.sw.invalid}\n${T.sw.chooseLanguage}`), state };
      lang = input === '1' ? 'sw' : 'en';
      return { reply: con(t().consent), state: next('ONBOARD_CONSENT', { temp: {} }) };
    }
    case 'ONBOARD_CONSENT': {
      // Deck slide 10: a consented dataset. Nothing is stored unless the farmer agrees.
      if (input === '2') return { reply: end(t().consentDeclined), state: next('DONE') };
      if (input !== '1') return { reply: con(`${t().invalid}\n${t().consent}`), state };
      return { reply: con(t().enterName), state: next('ONBOARD_NAME', { temp: { consentAt: new Date().toISOString() } }) };
    }
    case 'ONBOARD_NAME': {
      const name = String(input || '').replace(/\s+/g, ' ').trim();
      if (name.length < 2 || name.length > 80) return { reply: con(t().badName), state };
      return { reply: con(t().location), state: next('ONBOARD_LOCATION', { temp: { ...(state.temp || {}), name } }) };
    }
    case 'ONBOARD_LOCATION': {
      if (input === '4') return { reply: con(t().enterOtherLocation), state: next('ONBOARD_LOCATION_OTHER') };
      const location = USSD_LOCATIONS[input];
      if (!location) return { reply: con(`${t().invalid}\n${t().location}`), state };
      const menu = await speciesMenu(lang);
      return { reply: menu.reply, state: next('ONBOARD_SPECIES', { temp: { ...(state.temp || {}), location } }) };
    }
    case 'ONBOARD_LOCATION_OTHER': {
      const name = String(input || '').replace(/\s+/g, ' ').trim();
      if (name.length < 2 || name.length > 60) return { reply: con(t().enterOtherLocation), state };
      const menu = await speciesMenu(lang);
      return {
        reply: menu.reply,
        // No coordinates for a typed place name: the farm is created without a map point (so no other site's
        // weather is used) until an admin sets it in Field operations → Farms.
        state: next('ONBOARD_SPECIES', { temp: { ...(state.temp || {}), location: { locationName: name, district: 'Unknown', region: 'Unknown', unmapped: true } } }),
      };
    }
    case 'ONBOARD_SPECIES': {
      const { species } = await speciesMenu(lang);
      const selected = species[Number(input) - 1];
      if (!/^\d+$/.test(input) || !selected) {
        const menu = await speciesMenu(lang);
        return { reply: con(`${t().invalid}\n${menu.reply.text}`), state };
      }
      return { reply: con(t().enterLines), state: next('ONBOARD_LINES', { temp: { ...(state.temp || {}), speciesId: selected.id } }) };
    }
    case 'ONBOARD_LINES': {
      const lineCount = parseLineCount(input);
      if (lineCount == null) return { reply: con(t().badLines), state };
      const finalState = next('MAIN', { temp: { ...(state.temp || {}), lineCount } });
      const created = await createUssdFarmer(phone, finalState);
      return {
        reply: con(fitScreen(`${t().registered}\n${t().main}`)),
        state: { ...finalState, userId: created.userId, farmCode: created.farmCode },
      };
    }
    default:
      return { reply: con(T.sw.chooseLanguage), state: { menu: 'ONBOARD_LANGUAGE', temp: {} } };
  }
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
  if (main) lines.push(riskLine(main, lang));
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
 * Menus: MAIN, STATUS_MENU, HELP_MENU, FARM, SYMPTOM, HARVEST_KG, HARVEST_CONFIRM, LANGUAGE.
 */
async function step(user, farms, state, input) {
  let lang = state.language;
  const t = () => T[lang];
  const farmById = (id) => farms.find((f) => f.id === id) || null;
  const next = (menu, patch = {}) => ({ ...state, menu, ...patch });

  // Runs a main-menu option once a farm is known.
  const runOption = async (option, farm) => {
    switch (option) {
      case 'RISK': return { reply: riskScreen(farm, await currentRisk(farm.id), lang), state: next('DONE', { farmId: farm.id }) };
      case 'OUTLOOK': return { reply: await outlookScreen(farm, lang), state: next('DONE', { farmId: farm.id }) };
      case 'REPORT': return { reply: con(t().symptoms), state: next('SYMPTOM', { farmId: farm.id }) };
      case 'HARVEST': return { reply: con(t().enterKg), state: next('HARVEST_KG', { farmId: farm.id, temp: { attempts: 0 } }) };
      case 'ADVICE': return { reply: adviceScreen(farm, await currentRisk(farm.id), lang), state: next('DONE', { farmId: farm.id }) };
      default: return { reply: con(`${t().invalid}\n${t().main}`), state: next('MAIN') };
    }
  };

  const pickFarmFor = (option) => (farms.length === 1
    ? runOption(option, farms[0])
    : { reply: farmMenu(farms, lang), state: next('FARM', { temp: { option } }) });

  if (input === '0' && state.menu !== 'MAIN') return { reply: con(t().main), state: next('MAIN', { temp: {} }) };

  switch (state.menu) {
    case 'MAIN': {
      // Deck slide 8: 1 Hali ya shamba · 2 Tahadhari · 3 Ripoti tatizo · 4 Rekodi mavuno · 5 Msaada
      if (input === '1') return { reply: con(t().statusMenu), state: next('STATUS_MENU') };
      if (input === '2') return { reply: await alertsScreen(farms, lang), state: next('DONE') };
      if (input === '3') return pickFarmFor('REPORT');
      if (input === '4') return pickFarmFor('HARVEST');
      if (input === '5') return { reply: con(t().helpMenu), state: next('HELP_MENU') };
      return { reply: con(`${t().invalid}\n${t().main}`), state };
    }
    case 'STATUS_MENU': {
      if (input === '1') return pickFarmFor('RISK');
      if (input === '2') return pickFarmFor('OUTLOOK');
      return { reply: con(`${t().invalid}\n${t().statusMenu}`), state };
    }
    case 'HELP_MENU': {
      if (input === '1') return pickFarmFor('ADVICE');
      if (input === '2') return { reply: con(t().language), state: next('LANGUAGE') };
      if (input === '3') return { reply: end(fitScreen(t().about)), state: next('DONE') };
      return { reply: con(`${t().invalid}\n${t().helpMenu}`), state };
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
    if (!user) {
      if (!existing || input === '') return save(con(T.sw.chooseLanguage), { menu: 'ONBOARD_LANGUAGE', temp: {} }, null, 'ACTIVE');
      const latest = input.split('*').pop().trim();
      const state = { menu: existing.currentMenu, temp: existing.tempData || {}, language: existing.language || 'sw' };
      try {
        const { reply, state: nextState } = await stepOnboarding(phone, state, latest);
        return save(reply, nextState, nextState.userId || null, reply.end ? 'ENDED' : 'ACTIVE');
      } catch (err) {
        console.warn(`[ussd] onboarding failed for ${maskPhone(phone)}:`, err.message);
        return save(end(T[state.language || 'sw'].error), { ...state, menu: 'ERROR' }, null, 'ENDED');
      }
    }
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
