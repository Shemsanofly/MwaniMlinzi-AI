import prisma from '../config/prisma.js';
import { levelRank } from '../ai/constants.js';
import { RiskService } from './riskService.js';
import { RecordService } from './recordService.js';
import { SMSService } from './smsService.js';
import { normalizeTzPhone, maskPhone } from '../utils/phone.js';

/**
 * Inbound SMS commands (Africa's Talking two-way SMS → POST /api/integrations/africastalking/sms).
 * The reply is sent back through SMSService (a real SMS, logged in notification_logs) in the
 * sender's preferred language. Commands (case-insensitive, English or Kiswahili):
 *   RISK|HATARI [FARM]              current risk + next action
 *   ACTION|USHAURI [FARM]           approved next action
 *   REPORT|RIPOTI [FARM] <words>    record observation (WEUPE/WHITE, KUKATIKA/BREAK, UCHAFU, NZURI/GOOD, MBAYA/POOR, <n>%)
 *   HARVEST|MAVUNO [FARM] <kg>      record harvest (kg dry)
 *   HELP|MSAADA
 */

const T = {
  sw: {
    help: 'MwaniMlinzi: Tuma HATARI (hatari), USHAURI (hatua), RIPOTI WEUPE/KUKATIKA/NZURI (dalili), MAVUNO <KILO>, MSAADA. Ukiwa na mashamba mengi ongeza namba ya shamba, mfano: HATARI FARM001',
    notRegistered: 'Simu hii haijasajiliwa MwaniMlinzi. Tafadhali jisajili kwanza.',
    farmNotFound: (code, list) => `Shamba ${code} halikupatikana. Mashamba yako: ${list || 'hakuna'}.`,
    insufficient: 'Data haitoshi kutoa ushauri wa kuaminika. Tuma RIPOTI kuripoti hali ya shamba.',
    noAction: 'Endelea kukagua shamba lako kila siku.',
    risk: (farm, level, type) => `${farm}: ${level} ya ${type}.`,
    action: 'Hatua',
    reportSaved: (farm) => `Asante. Ripoti ya ${farm} imepokelewa.`,
    badKg: 'Tafadhali tuma: MAVUNO <KILO>. Mfano: MAVUNO 120',
    harvestSaved: (kg, farm) => `Asante. Mavuno ya kg ${kg} yamerekodiwa kwa ${farm}.`,
    error: 'Samahani, kuna hitilafu. Jaribu tena baadaye.',
    level: { LOW: 'Hatari ndogo', MEDIUM: 'Hatari ya kati', HIGH: 'Hatari kubwa', CRITICAL: 'Hatari kubwa sana' },
    type: { HEAT_ICE_ICE: 'joto/ice-ice', STORM_LINE_DAMAGE: 'dhoruba', POOR_GROWTH: 'ukuaji hafifu' },
  },
  en: {
    help: 'MwaniMlinzi: Send RISK (risk), ACTION (advice), REPORT WHITE/BREAK/GOOD (symptoms), HARVEST <KG>, HELP. With several farms add the farm code, e.g. RISK FARM001',
    notRegistered: 'This phone is not registered with MwaniMlinzi. Please register first.',
    farmNotFound: (code, list) => `Farm ${code} was not found. Your farms: ${list || 'none'}.`,
    insufficient: 'Not enough data to give reliable advice. Send REPORT to report your farm condition.',
    noAction: 'Keep checking your farm every day.',
    risk: (farm, level, type) => `${farm}: ${level} of ${type}.`,
    action: 'Action',
    reportSaved: (farm) => `Thank you. Report for ${farm} received.`,
    badKg: 'Please send: HARVEST <KG>. Example: HARVEST 120',
    harvestSaved: (kg, farm) => `Thank you. Harvest of ${kg} kg recorded for ${farm}.`,
    error: 'Sorry, something went wrong. Please try again later.',
    level: { LOW: 'Low risk', MEDIUM: 'Medium risk', HIGH: 'High risk', CRITICAL: 'Very high risk' },
    type: { HEAT_ICE_ICE: 'heat/ice-ice', STORM_LINE_DAMAGE: 'storm', POOR_GROWTH: 'slow growth' },
  },
};

const COMMANDS = {
  RISK: 'RISK', HATARI: 'RISK',
  ACTION: 'ACTION', USHAURI: 'ACTION',
  REPORT: 'REPORT', RIPOTI: 'REPORT',
  HARVEST: 'HARVEST', MAVUNO: 'HARVEST',
  HELP: 'HELP', MSAADA: 'HELP',
};

async function findUser(phone) {
  if (!phone) return null;
  return prisma.user.findFirst({
    where: { phone, isActive: true },
    include: { farmer: { include: { farms: { where: { status: { not: 'INACTIVE' } }, orderBy: { farmCode: 'asc' }, select: { id: true, farmCode: true } } } } },
  });
}

async function currentRisk(farmId) {
  const r = await RiskService.latestForFarm(farmId);
  if (r.predictions.length) return r;
  return RiskService.runForFarm(farmId, { trigger: 'MANUAL', refreshEnvironment: false });
}

const mainRisk = (risk) => risk.predictions
  .filter((p) => p.riskType !== 'HARVEST_WINDOW' && !p.insufficientData)
  .sort((a, b) => levelRank(b.riskLevel) - levelRank(a.riskLevel) || b.probability - a.probability)[0] || null;

const actionText = (risk, lang) => {
  const a = risk.nextAction?.recommendation?.actionItem;
  return a ? (lang === 'en' ? a.action : a.actionSw) : null;
};

function riskText(farm, risk, lang) {
  const t = T[lang];
  const main = mainRisk(risk);
  if (!main) return `${farm.farmCode}: ${t.insufficient}`;
  const action = actionText(risk, lang);
  return `${t.risk(farm.farmCode, t.level[main.riskLevel], t.type[main.riskType])} ${t.action}: ${action || t.noAction}`;
}

/** Builds the reply text for one inbound message. Exported for unit tests. */
export async function buildSmsReply(user, message) {
  const lang = user?.preferredLanguage === 'en' ? 'en' : 'sw';
  const t = T[lang];
  const parts = String(message || '').trim().split(/\s+/).filter(Boolean);
  const cmd = COMMANDS[(parts[0] || '').toUpperCase()] || 'HELP';
  if (cmd === 'HELP') return { reply: t.help, command: cmd };

  const farms = user.farmer?.farms || [];
  const maybeCode = (parts[1] || '').toUpperCase();
  const explicit = farms.find((f) => f.farmCode === maybeCode);
  const looksLikeCode = /^[A-Z]{2,}\d+$/.test(maybeCode);
  if (!explicit && looksLikeCode) return { reply: t.farmNotFound(maybeCode, farms.map((f) => f.farmCode).join(', ')), command: cmd };
  const farm = explicit || farms[0];
  if (!farm) return { reply: t.farmNotFound('', ''), command: cmd };
  const args = parts.slice(explicit ? 2 : 1);

  switch (cmd) {
    case 'RISK':
      return { reply: riskText(farm, await currentRisk(farm.id), lang), command: cmd };
    case 'ACTION': {
      const risk = await currentRisk(farm.id);
      const action = actionText(risk, lang);
      if (action) return { reply: `${farm.farmCode} - ${t.action}: ${action}`, command: cmd };
      return { reply: `${farm.farmCode}: ${mainRisk(risk) ? t.noAction : t.insufficient}`, command: cmd };
    }
    case 'REPORT': {
      const words = args.join(' ').toUpperCase();
      const pct = words.match(/(\d{1,3})\s*%/);
      const whitening = /WEUPE|WHITE|NYEUPE|RANGI/.test(words);
      const breakage = /KUKATIKA|BREAK|KATIKA/.test(words);
      const epiphytes = /UCHAFU|EPIPHYT/.test(words);
      const slow = /HAFIFU|SLOW/.test(words);
      const poor = /MBAYA|POOR/.test(words);
      const { risk } = await RecordService.createObservation(farm.id, user, {
        cropCondition: poor ? 'POOR' : whitening || breakage || epiphytes || slow ? 'FAIR' : 'GOOD',
        whitening, breakage, epiphytes, diseaseSymptoms: whitening, unusualGrowth: slow, growthCondition: slow ? 'SLOW' : null,
        percentAffected: pct ? Math.min(100, Number(pct[1])) : null,
        notes: `SMS: ${String(message).slice(0, 200)}`, confidence: 'MEDIUM',
      }, { channel: 'SMS' });
      return { reply: `${t.reportSaved(farm.farmCode)} ${riskText(farm, risk, lang)}`, command: cmd };
    }
    case 'HARVEST': {
      const raw = String(args[0] || '').replace(',', '.');
      const kg = /^\d{1,6}(\.\d{1,2})?$/.test(raw) ? Number(raw) : NaN;
      if (!(kg > 0 && kg <= 100000)) return { reply: t.badKg, command: cmd };
      await RecordService.createHarvest(farm.id, { harvestDate: new Date(), actualQuantity: kg, unit: 'KG_DRY', closeCycle: false, notes: 'Recorded via SMS' }, { channel: 'SMS' });
      return { reply: t.harvestSaved(kg, farm.farmCode), command: cmd };
    }
    default:
      return { reply: t.help, command: 'HELP' };
  }
}

export const ChannelService = {
  /**
   * Handle one inbound SMS: log it, build the reply, send the reply as a real SMS.
   * @returns { reply, command, send } — send = SMSService result (SENT/QUEUED/FAILED/NOT_CONFIGURED)
   */
  async processInboundSms({ from, text, linkId = null }) {
    const phone = normalizeTzPhone(from);
    await prisma.smsMessage.create({ data: { direction: 'INBOUND', phoneNumber: phone || String(from || ''), body: String(text || '').slice(0, 1000), simulated: false } });
    const user = await findUser(phone);
    let result;
    if (!user) result = { reply: T.sw.notRegistered, command: 'UNREGISTERED' };
    else {
      result = await buildSmsReply(user, text).catch((err) => {
        console.warn(`[sms] inbound processing failed for ${maskPhone(phone)}:`, err.message);
        return { reply: T[user.preferredLanguage === 'en' ? 'en' : 'sw'].error, command: 'ERROR' };
      });
    }
    await prisma.smsMessage.create({ data: { direction: 'OUTBOUND', phoneNumber: phone || String(from || ''), body: result.reply, command: result.command.slice(0, 20), simulated: false } });
    const send = phone
      ? await SMSService.sendRaw(phone, result.reply, { type: 'SMS_REPLY', language: user?.preferredLanguage || 'sw', linkId })
      : { status: 'FAILED', reason: 'INVALID_PHONE' };
    return { ...result, send, userId: user?.id || null };
  },
};
