import prisma from '../config/prisma.js';
import { RISK_LABELS, LEVEL_LABELS } from '../ai/constants.js';
import { RiskService } from './riskService.js';
import { RecordService } from './recordService.js';
import { createUSSDProvider } from '../providers/ussdProvider.js';
import { cropAgeDays } from '../utils/dates.js';

const ussdProvider = createUSSDProvider();
export const getUSSDProvider = () => ussdProvider;

const LEVEL_WORD_SW = { LOW: 'NDOGO', MEDIUM: 'WASTANI', HIGH: 'KUBWA', CRITICAL: 'MUHIMU SANA' };
const RISK_WORD_SW = { HEAT_ICE_ICE: 'joto/ice-ice', STORM_LINE_DAMAGE: 'dhoruba', POOR_GROWTH: 'ukuaji hafifu', HARVEST_WINDOW: 'mavuno' };

const normalizePhone = (p) => String(p || '').replace(/[^0-9+]/g, '');

/** A farmer is identified on SMS/USSD by their registered phone number. */
async function farmerByPhone(phoneNumber) {
  const phone = normalizePhone(phoneNumber);
  const user = await prisma.user.findFirst({ where: { phone, isActive: true }, include: { farmer: { include: { farms: { orderBy: { farmCode: 'asc' }, include: { species: true } } } } } });
  return user?.farmer ? { user, farmer: user.farmer, farms: user.farmer.farms } : null;
}

async function currentRisk(farmId) {
  let r = await RiskService.latestForFarm(farmId);
  if (!r.predictions.length) r = await RiskService.runForFarm(farmId, { trigger: 'MANUAL' });
  return r;
}

function riskSummarySw(risk) {
  const by = Object.fromEntries(risk.predictions.map((p) => [p.riskType, p]));
  const heat = by.HEAT_ICE_ICE;
  const storm = by.STORM_LINE_DAMAGE;
  return { heat, storm, by };
}

/* ──────────────────────────────── SMS ──────────────────────────────── */

const SMS_HELP = 'MwaniMlinzi: Tuma RISK <SHAMBA> (hatari), USHAURI <SHAMBA> (hatua), RIPOTI <SHAMBA> WEUPE/KUKATIKA/NZURI (dalili), MAVUNO <SHAMBA> <KG>, MSAADA. Mfano: RISK FARM001';

/**
 * SMS command processor (used by the simulator and by a live gateway callback).
 * Commands (case-insensitive, English or Kiswahili):
 *   RISK|HATARI <FARM>         current risk + next action
 *   ACTION|USHAURI <FARM>      approved next action
 *   REPORT|RIPOTI <FARM> <words>  record observation (WEUPE/WHITE, KUKATIKA/BREAK, UCHAFU/EPIPHYTES, NZURI/GOOD, MBAYA/POOR, <n>%)
 *   HARVEST|MAVUNO <FARM> <kg> record harvest (kg dry)
 *   HELP|MSAADA
 */
export async function processSms({ from, message }) {
  const phone = normalizePhone(from);
  await prisma.smsMessage.create({ data: { direction: 'INBOUND', phoneNumber: phone, body: message, simulated: true } });
  const reply = await buildSmsReply(phone, message).catch((err) => {
    console.warn('[sms] processing failed:', err.message);
    return 'Samahani, kuna hitilafu. Jaribu tena baadaye.';
  });
  const [cmdWord] = message.trim().split(/\s+/);
  await prisma.smsMessage.create({ data: { direction: 'OUTBOUND', phoneNumber: phone, body: reply, command: cmdWord.toUpperCase().slice(0, 20), simulated: true } });
  return { reply, command: cmdWord.toUpperCase() };
}

async function buildSmsReply(phone, message) {
  const parts = message.trim().split(/\s+/);
  const cmd = (parts[0] || '').toUpperCase();
  if (['HELP', 'MSAADA'].includes(cmd)) return SMS_HELP;
  const who = await farmerByPhone(phone);
  if (!who) return 'Namba hii haijasajiliwa na MwaniMlinzi. Wasiliana na ushirika wako ili kusajiliwa.';
  const code = (parts[1] || '').toUpperCase();
  const farm = code ? who.farms.find((f) => f.farmCode === code) : who.farms[0];
  if (!farm) return `Shamba ${code || ''} halikupatikana kwa namba yako. Mashamba yako: ${who.farms.map((f) => f.farmCode).join(', ') || 'hakuna'}.`;

  switch (cmd) {
    case 'RISK':
    case 'HATARI': {
      const risk = await currentRisk(farm.id);
      const { heat, storm } = riskSummarySw(risk);
      const next = risk.nextAction?.recommendation?.actionItem;
      const main = [heat, storm].filter(Boolean).sort((a, b) => b.probability - a.probability)[0];
      if (!main) return 'Taarifa hazitoshi kwa utabiri. Tuma RIPOTI ili kuripoti hali ya shamba.';
      return `${farm.farmCode}: Shamba lako lina hatari ${LEVEL_WORD_SW[main.riskLevel]} ya ${RISK_WORD_SW[main.riskType]} kwa siku 3 zijazo (${Math.round(main.probability * 100)}%).`
        + `${main === heat && storm ? ` Dhoruba: ${LEVEL_WORD_SW[storm.riskLevel]}.` : heat ? ` Joto: ${LEVEL_WORD_SW[heat.riskLevel]}.` : ''}`
        + `${next ? ` Hatua: ${next.actionSw}` : ''}`;
    }
    case 'ACTION':
    case 'USHAURI': {
      const risk = await currentRisk(farm.id);
      const next = risk.nextAction?.recommendation?.actionItem;
      return next ? `${farm.farmCode} - Hatua: ${next.actionSw}` : `${farm.farmCode}: ${risk.insufficientDataMessage?.sw || 'Endelea kufuatilia shamba lako.'}`;
    }
    case 'REPORT':
    case 'RIPOTI': {
      const words = parts.slice(2).join(' ').toUpperCase();
      const pctMatch = words.match(/(\d{1,3})\s*%/);
      const whitening = /WEUPE|WHITE|NYEUPE|RANGI/.test(words);
      const breakage = /KUKATIKA|BREAK|KATIKA/.test(words);
      const epiphytes = /UCHAFU|EPIPHYT/.test(words);
      const poor = /MBAYA|POOR/.test(words);
      const data = {
        cropCondition: poor ? 'POOR' : whitening || breakage || epiphytes ? 'FAIR' : 'GOOD',
        whitening, breakage, epiphytes, diseaseSymptoms: whitening, unusualGrowth: false,
        percentAffected: pctMatch ? Math.min(100, Number(pctMatch[1])) : null,
        notes: `SMS: ${message.slice(0, 200)}`, confidence: 'MEDIUM',
      };
      const { risk } = await RecordService.createObservation(farm.id, who.user, data, { channel: 'SMS' });
      const heat = risk.predictions.find((p) => p.riskType === 'HEAT_ICE_ICE');
      const next = risk.nextAction?.recommendation?.actionItem;
      return `Asante. Ripoti ya ${farm.farmCode} imepokelewa. Hatari ya joto/ice-ice sasa: ${LEVEL_WORD_SW[heat.riskLevel]}.${next ? ` Hatua: ${next.actionSw}` : ''}`;
    }
    case 'HARVEST':
    case 'MAVUNO': {
      const kg = Number(parts[2]);
      if (!Number.isFinite(kg) || kg <= 0) return 'Tafadhali tuma: MAVUNO <SHAMBA> <KILO>. Mfano: MAVUNO FARM001 120';
      const h = await RecordService.createHarvest(farm.id, { harvestDate: new Date(), actualQuantity: kg, unit: 'KG_DRY', closeCycle: true });
      return `Asante. Mavuno ya kg ${kg} yamerekodiwa kwa ${farm.farmCode}.${h.lossPercent ? ` Tofauti na makadirio: -${h.lossPercent}%.` : ''}`;
    }
    default:
      return SMS_HELP;
  }
}

/* ──────────────────────────────── USSD ──────────────────────────────── */

const MAIN_MENU = 'MwaniMlinzi\n1. Angalia Hatari\n2. Ripoti Dalili\n3. Rekodi Mavuno\n4. Ushauri\n5. Historia';

/**
 * USSD state machine (Africa's Talking protocol: `text` is the full '*'-joined input path).
 * Stateless by design — the path encodes the state — with sessions logged in `ussd_sessions`.
 */
export async function processUssd({ sessionId, phoneNumber, text }) {
  const phone = normalizePhone(phoneNumber);
  const inputs = text ? text.split('*').map((s) => s.trim()) : [];
  let result;
  try {
    result = await ussdStep(phone, inputs);
  } catch (err) {
    console.warn('[ussd] failed:', err.message);
    result = { text: 'Samahani, kuna hitilafu. Jaribu tena.', end: true, state: 'ERROR' };
  }
  await prisma.ussdSession.upsert({
    where: { sessionId },
    update: { lastInput: text, lastState: result.state || 'MENU' },
    create: { sessionId, phoneNumber: phone, lastInput: text, lastState: result.state || 'MENU' },
  });
  return { response: ussdProvider.format(result), end: !!result.end, state: result.state };
}

async function ussdStep(phone, inputs) {
  const who = await farmerByPhone(phone);
  if (!who) return { text: 'Namba hii haijasajiliwa na MwaniMlinzi. Wasiliana na ushirika wako.', end: true, state: 'UNREGISTERED' };
  if (!who.farms.length) return { text: 'Huna shamba lililosajiliwa.', end: true, state: 'NO_FARM' };
  if (!inputs.length) return { text: MAIN_MENU, state: 'MAIN' };

  let [choice, ...rest] = inputs;
  // Farmers with several farms pick the farm first for options 1–5.
  let farm = who.farms[0];
  if (who.farms.length > 1) {
    if (!rest.length) {
      if (!['1', '2', '3', '4', '5'].includes(choice)) return { text: `Chaguo si sahihi.\n${MAIN_MENU}`, state: 'MAIN' };
      return { text: `Chagua shamba:\n${who.farms.map((f, i) => `${i + 1}. ${f.farmCode} ${f.name}`).join('\n')}`, state: 'PICK_FARM' };
    }
    const idx = Number(rest[0]) - 1;
    if (!who.farms[idx]) return { text: 'Shamba si sahihi.', end: true, state: 'PICK_FARM' };
    farm = who.farms[idx];
    rest = rest.slice(1);
  }

  switch (choice) {
    case '1': {
      const risk = await currentRisk(farm.id);
      const { by } = riskSummarySw(risk);
      const next = risk.nextAction?.recommendation?.actionItem;
      const lines = ['HEAT_ICE_ICE', 'STORM_LINE_DAMAGE', 'POOR_GROWTH'].filter((rt) => by[rt]).map((rt) => `Hatari ya ${RISK_WORD_SW[rt]}: ${LEVEL_WORD_SW[by[rt].riskLevel]}`);
      return { text: `${farm.farmCode}\n${lines.join('\n')}${next ? `\nHatua: ${next.actionSw}` : ''}`, end: true, state: 'RISK' };
    }
    case '2': {
      const q = [
        'Hali ya mwani?\n1. Nzuri\n2. Wastani\n3. Mbaya',
        'Unaona mwani mweupe (whitening)?\n1. Ndiyo\n2. Hapana',
        'Unaona kukatika?\n1. Ndiyo\n2. Hapana',
        'Ukuaji usio wa kawaida?\n1. Ndiyo\n2. Hapana',
      ];
      if (rest.length < q.length) return { text: q[rest.length], state: `REPORT_${rest.length + 1}` };
      const [cond, white, brk, growth] = rest;
      const valid = ['1', '2', '3'].includes(cond) && [white, brk, growth].every((v) => v === '1' || v === '2');
      if (!valid) return { text: 'Jibu si sahihi. Anza tena kwa *123#.', end: true, state: 'REPORT_INVALID' };
      const data = {
        cropCondition: { 1: 'GOOD', 2: 'FAIR', 3: 'POOR' }[cond],
        whitening: white === '1', breakage: brk === '1', epiphytes: false, diseaseSymptoms: white === '1', unusualGrowth: growth === '1',
        growthCondition: growth === '1' ? 'UNUSUAL' : 'NORMAL', notes: 'USSD report', confidence: 'MEDIUM',
      };
      const { risk } = await RecordService.createObservation(farm.id, who.user, data, { channel: 'USSD' });
      const heat = risk.predictions.find((p) => p.riskType === 'HEAT_ICE_ICE');
      const next = risk.nextAction?.recommendation?.actionItem;
      return { text: `Asante, ripoti imepokelewa.\nHatari ya joto: ${LEVEL_WORD_SW[heat.riskLevel]}${next ? `\nHatua: ${next.actionSw}` : ''}`, end: true, state: 'REPORT_DONE' };
    }
    case '3': {
      if (!rest.length) return { text: 'Weka kilo za mwani mkavu uliovuna:', state: 'HARVEST_KG' };
      const kg = Number(rest[0]);
      if (!Number.isFinite(kg) || kg <= 0 || kg > 1e6) return { text: 'Kiasi si sahihi.', end: true, state: 'HARVEST_INVALID' };
      await RecordService.createHarvest(farm.id, { harvestDate: new Date(), actualQuantity: kg, unit: 'KG_DRY', closeCycle: true });
      return { text: `Asante. Mavuno ya kg ${kg} yamerekodiwa kwa ${farm.farmCode}.`, end: true, state: 'HARVEST_DONE' };
    }
    case '4': {
      const risk = await currentRisk(farm.id);
      const next = risk.nextAction?.recommendation?.actionItem;
      return { text: next ? `Ushauri (${farm.farmCode}):\n${next.actionSw}` : risk.insufficientDataMessage?.sw || 'Endelea kufuatilia shamba lako.', end: true, state: 'ADVICE' };
    }
    case '5': {
      const [obs, harvest, cycle] = await Promise.all([
        prisma.farmObservation.findFirst({ where: { farmId: farm.id }, orderBy: { observedAt: 'desc' } }),
        prisma.harvestRecord.findFirst({ where: { farmId: farm.id }, orderBy: { harvestDate: 'desc' } }),
        prisma.plantingCycle.findFirst({ where: { farmId: farm.id, status: 'ACTIVE' } }),
      ]);
      const d = (x) => new Date(x).toISOString().slice(0, 10);
      const lines = [
        cycle ? `Umri wa mwani: siku ${cropAgeDays(cycle.plantingDate)}` : 'Hakuna upandaji unaoendelea',
        obs ? `Ripoti ya mwisho: ${d(obs.observedAt)} (${{ GOOD: 'Nzuri', FAIR: 'Wastani', POOR: 'Mbaya' }[obs.cropCondition]})` : 'Hakuna ripoti',
        harvest ? `Mavuno ya mwisho: kg ${harvest.actualQuantity} (${d(harvest.harvestDate)})` : 'Hakuna mavuno',
      ];
      return { text: `${farm.farmCode}\n${lines.join('\n')}`, end: true, state: 'HISTORY' };
    }
    default:
      return { text: `Chaguo si sahihi.\n${MAIN_MENU}`, state: 'MAIN' };
  }
}

export { RISK_LABELS, LEVEL_LABELS };
