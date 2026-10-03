import { events } from '../db/records.js';
import prisma from '../config/prisma.js';
import { buildSmsReply } from './channelService.js';
import { normalizeTzPhone, maskPhone } from '../utils/phone.js';

/**
 * WhatsApp chatbot (via Sarufi).
 *
 * Sarufi is the WhatsApp gateway: every incoming WhatsApp message reaches
 * POST /api/integrations/sarufi/webhook?secret=… as { chat_id, message, phone_number }. This service
 * decides what to reply with and hands the text back to Sarufi, which pushes it to WhatsApp.
 *
 * Two message classes:
 *   - Fresh conversation / greeting / "menu" / "1..5" → welcome text + numbered menu.
 *   - Anything else → routed through `buildSmsReply`, the same channel-agnostic handler that answers
 *     inbound SMS commands (HATARI, RIPOTI, MAVUNO, USHAURI, MSAADA in Kiswahili or English). One
 *     product, three channels (USSD, SMS, WhatsApp) share one command set.
 *
 * WhatsApp is chattier than SMS (no 160-char cap and no per-message cost) so replies here include a
 * short "namba au andika swali" footer to teach farmers the shortcuts.
 */

const MAX_WHATSAPP_REPLY = 1500; // room for a formatted reply while staying well below WhatsApp's 4096.

const T = {
  sw: {
    welcome: 'Karibu MwaniMlinzi kwenye WhatsApp!',
    menu: '1. Hali ya shamba\n2. Tahadhari\n3. Ripoti tatizo\n4. Rekodi mavuno\n5. Msaada',
    footer: '\n\nAndika namba au andika swali lako moja kwa moja (mfano: HATARI, RIPOTI WEUPE, MAVUNO 120, MSAADA).',
    notRegistered: 'Namba hii haijasajiliwa MwaniMlinzi. Tafadhali jisajili kwanza — piga *384*64265# kutoka simu yako, au bonyeza kiungo ulichotumiwa na ushirika wako.',
    statusMenu: 'Hali ya shamba:\n- Andika HATARI kupata hatari na hatua ya sasa.\n- Andika USHAURI kupata hatua iliyopendekezwa.\nUnaweza kuongeza namba ya shamba, mfano: HATARI FARM002',
    alerts: 'Kupata tahadhari za mashamba yako, andika HATARI (au HATARI FARM002 kama una zaidi ya moja).',
    reportPrompt: 'Kuripoti tatizo, andika mfano: RIPOTI WEUPE, RIPOTI KUKATIKA, RIPOTI NZURI. Unaweza kuongeza namba ya shamba na asilimia, mfano: RIPOTI FARM002 WEUPE 30%',
    harvestPrompt: 'Kurekodi mavuno, andika MAVUNO <kilo>. Mfano: MAVUNO 120. Ongeza namba ya shamba ikiwa una zaidi ya moja: MAVUNO FARM002 120',
    error: 'Samahani, kuna tatizo. Tafadhali jaribu tena baadaye.',
  },
  en: {
    welcome: 'Welcome to MwaniMlinzi on WhatsApp!',
    menu: '1. Farm status\n2. Alerts\n3. Report a problem\n4. Record harvest\n5. Help',
    footer: '\n\nType a number or send a keyword directly (e.g. RISK, REPORT WHITE, HARVEST 120, HELP).',
    notRegistered: 'This number is not registered with MwaniMlinzi. Please register first — dial *384*64265# from your phone, or use the link sent by your cooperative.',
    statusMenu: 'Farm status:\n- Send RISK for the current risk and next action.\n- Send ACTION for the recommended step.\nAdd a farm code, e.g. RISK FARM002',
    alerts: 'For farm alerts, send RISK (or RISK FARM002 if you have more than one).',
    reportPrompt: 'To report a problem, send e.g. REPORT WHITE, REPORT BREAK, REPORT GOOD. Add a farm code and percentage, e.g. REPORT FARM002 WHITE 30%',
    harvestPrompt: 'To record a harvest, send HARVEST <kg>. Example: HARVEST 120. Add a farm code if you have more than one: HARVEST FARM002 120',
    error: 'Sorry, something went wrong. Please try again later.',
  },
};

const GREETINGS = /^(hi|hey|hello|habari|mambo|jambo|karibu|start|menu|anza)\b/i;
const MENU_HINTS = { 1: 'STATUS_MENU', 2: 'ALERTS', 3: 'REPORT_HINT', 4: 'HARVEST_HINT', 5: 'HELP' };

async function findUser(phone) {
  if (!phone) return null;
  return prisma.user.findFirst({
    where: { phone, isActive: true },
    include: { farmer: { include: { farms: { where: { status: { not: 'INACTIVE' } }, orderBy: { farmCode: 'asc' }, select: { id: true, farmCode: true } } } } },
  });
}

const clamp = (s) => (s.length > MAX_WHATSAPP_REPLY ? `${s.slice(0, MAX_WHATSAPP_REPLY - 1)}…` : s);

/**
 * Build a WhatsApp reply for one inbound message. Pure function (no I/O beyond user lookup + risk/records).
 * @returns { reply, kind } — kind is a short label for logs (WELCOME, MENU_1..MENU_5, COMMAND_<cmd>, UNREGISTERED, ERROR)
 */
export async function buildWhatsappReply({ phone, message }) {
  const normalized = normalizeTzPhone(phone);
  const user = await findUser(normalized);
  const lang = user?.preferredLanguage === 'en' ? 'en' : 'sw';
  const t = T[lang];
  const raw = String(message || '').trim();
  if (!user) return { reply: clamp(t.notRegistered), kind: 'UNREGISTERED' };

  // Fresh chat / greeting / a bare numeric menu selection → welcome + menu (or the picked branch).
  if (!raw || GREETINGS.test(raw) || raw.toLowerCase() === 'msaada' && !user) {
    return { reply: clamp(`${t.welcome}\n\n${t.menu}${t.footer}`), kind: 'WELCOME' };
  }
  const menuHint = MENU_HINTS[raw];
  if (menuHint) {
    const hint = { STATUS_MENU: t.statusMenu, ALERTS: t.alerts, REPORT_HINT: t.reportPrompt, HARVEST_HINT: t.harvestPrompt, HELP: null }[menuHint];
    if (menuHint === 'HELP') {
      // Fall through to the shared HELP handler in buildSmsReply so both channels stay in sync.
    } else {
      return { reply: clamp(hint), kind: `MENU_${raw}` };
    }
  }

  // Everything else is a command / keyword shared with the SMS channel.
  const { reply, command } = await buildSmsReply(user, raw);
  return { reply: clamp(reply), kind: `COMMAND_${command}` };
}

export const WhatsAppService = {
  /**
   * Process one Sarufi WhatsApp webhook. Logs the exchange to `sms_messages` with direction WHATSAPP_IN /
   * WHATSAPP_OUT for a single auditable trail (same table SMS uses, distinguished by simulated=false and
   * body content — the schema does not need a new column). Errors return a safe apology, never a stacktrace.
   */
  async handle({ phone, message, chatId = null }) {
    try {
      await events(prisma, 'SMS').create({ data: {
        direction: 'INBOUND',
        phoneNumber: normalizeTzPhone(phone) || String(phone || ''),
        body: `[whatsapp${chatId ? `:${String(chatId).slice(0, 32)}` : ''}] ${String(message || '').slice(0, 1000)}`,
        simulated: false,
      } });
    } catch (err) {
      // Logging failures never block a reply.
      console.warn(`[whatsapp] inbound log failed for ${maskPhone(phone)}:`, err.message);
    }
    let result;
    try {
      result = await buildWhatsappReply({ phone, message });
    } catch (err) {
      console.warn(`[whatsapp] reply failed for ${maskPhone(phone)}:`, err.message);
      result = { reply: T.sw.error, kind: 'ERROR' };
    }
    try {
      await events(prisma, 'SMS').create({ data: {
        direction: 'OUTBOUND',
        phoneNumber: normalizeTzPhone(phone) || String(phone || ''),
        body: `[whatsapp] ${result.reply.slice(0, 1000)}`,
        command: result.kind.slice(0, 20),
        simulated: false,
      } });
    } catch (err) {
      console.warn(`[whatsapp] outbound log failed for ${maskPhone(phone)}:`, err.message);
    }
    return result;
  },
};
