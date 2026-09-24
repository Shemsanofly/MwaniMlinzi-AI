import prisma from '../config/prisma.js';
import { AfricasTalkingSMSClient, mapDeliveryStatus } from '../providers/africastalking/smsClient.js';
import { atConfig } from '../providers/africastalking/config.js';
import { normalizeTzPhone, maskPhone } from '../utils/phone.js';
import { getSetting } from './settingsService.js';

let client = new AfricasTalkingSMSClient();
export const setSMSClient = (c) => { client = c; };
export const getSMSClient = () => client;

/** Which user preference controls each SMS type. All SMS also require `smsEnabled`. */
const PREF_FOR_TYPE = {
  RISK_ALERT: 'notifyRiskAlerts',
  HARVEST_REMINDER: 'notifyHarvest',
  SYSTEM: 'notifySystem',
  RECOMMENDATION: 'notifyRiskAlerts',
  OBSERVATION_CONFIRMATION: null,
  HARVEST_CONFIRMATION: null,
  SMS_REPLY: null,
  ADMIN_TEST: null,
};
const PRIORITY_RANK = { INFO: 0, WARNING: 1, HIGH: 2, CRITICAL: 3 };
const MAX_SMS_CHARS = 306; // two concatenated SMS segments

export const smsText = (text) => (text.length > MAX_SMS_CHARS ? `${text.slice(0, MAX_SMS_CHARS - 1)}…` : text);

/**
 * Decide whether an SMS may be sent (without sending). Returns { allowed, reason }.
 * Rules: user opted in, the type-specific preference is on, a valid phone exists, risk alerts only
 * for HIGH/CRITICAL, and demo accounts never receive SMS from a production Africa's Talking account.
 */
export function smsPolicy(user, { type, priority = 'INFO' }) {
  if (!user) return { allowed: false, reason: 'NO_USER' };
  if (type !== 'ADMIN_TEST' && type !== 'SMS_REPLY') {
    if (user.smsEnabled === false) return { allowed: false, reason: 'SMS_DISABLED_BY_USER' };
    const pref = PREF_FOR_TYPE[type];
    if (pref && user[pref] === false) return { allowed: false, reason: 'PREFERENCE_OFF' };
    if (type === 'RISK_ALERT' && PRIORITY_RANK[priority] < PRIORITY_RANK.HIGH) return { allowed: false, reason: 'PRIORITY_TOO_LOW' };
  }
  if (!normalizeTzPhone(user.phone)) return { allowed: false, reason: 'NO_VALID_PHONE' };
  if (user.isDemo && atConfig().environment === 'production') return { allowed: false, reason: 'DEMO_ACCOUNT_IN_PRODUCTION' };
  return { allowed: true };
}

export const SMSService = {
  /**
   * Send one SMS to a user in their preferred language and log it in notification_logs.
   * @param user   { id, phone, preferredLanguage, smsEnabled, notify*, isDemo }
   * @param opts   { type, priority, text: { en, sw } | string, notificationId?, force? }
   * @returns { status, logId?, reason? } — status is one of QUEUED/SENT/FAILED/NOT_CONFIGURED/SKIPPED
   */
  async sendToUser(user, { type, priority = 'INFO', text, notificationId = null }) {
    const language = user?.preferredLanguage === 'en' ? 'en' : 'sw';
    const message = smsText(typeof text === 'string' ? text : text[language] || text.sw || text.en);
    const policy = smsPolicy(user, { type, priority });
    if (!policy.allowed) return { status: 'SKIPPED', reason: policy.reason };
    if (!(await getSetting('notifications.smsEnabled'))) return { status: 'SKIPPED', reason: 'SMS_DISABLED_BY_ADMIN' };
    return this.sendRaw(normalizeTzPhone(user.phone), message, { type, language, notificationId });
  },

  /** Low-level send + log (also used by the admin "Test SMS" and inbound-SMS replies). */
  async sendRaw(phone, message, { type = 'GENERAL', language = null, notificationId = null, linkId = null } = {}) {
    const to = normalizeTzPhone(phone);
    if (!to) return { status: 'FAILED', reason: 'INVALID_PHONE' };
    const result = await client.send(to, smsText(message), linkId ? { linkId } : undefined);
    const log = await prisma.notificationLog.create({
      data: {
        notificationId, channel: 'SMS', provider: client.name, recipient: to, status: result.status,
        providerRef: result.providerRef || null, providerStatus: result.providerStatus || null, messageType: type, language,
        message: smsText(message), cost: result.cost || null, error: result.error || null,
        sentAt: ['QUEUED', 'SENT'].includes(result.status) ? new Date() : null,
      },
    });
    if (notificationId) await prisma.notification.update({ where: { id: notificationId }, data: { status: result.status } }).catch(() => {});
    if (result.status === 'FAILED') console.warn(`[sms] send to ${maskPhone(to)} failed: ${result.error}`);
    return { status: result.status, logId: log.id, providerRef: result.providerRef || null, reason: result.error || null };
  },

  sendRiskAlert(user, { priority, text, notificationId }) { return this.sendToUser(user, { type: 'RISK_ALERT', priority, text, notificationId }); },
  sendRecommendation(user, { text, notificationId }) { return this.sendToUser(user, { type: 'RECOMMENDATION', priority: 'HIGH', text, notificationId }); },
  sendHarvestReminder(user, { text, notificationId }) { return this.sendToUser(user, { type: 'HARVEST_REMINDER', priority: 'WARNING', text, notificationId }); },
  sendNotification(user, { type = 'SYSTEM', priority = 'WARNING', text, notificationId }) { return this.sendToUser(user, { type, priority, text, notificationId }); },

  /**
   * Africa's Talking delivery report → update the log (and its notification). Idempotent: repeating the
   * same report does not change anything; a later "final" status (DELIVERED/FAILED) is never downgraded.
   */
  async handleDeliveryReport({ id, status, failureReason }) {
    if (!id) return { updated: false, reason: 'MISSING_ID' };
    const log = await prisma.notificationLog.findFirst({ where: { providerRef: String(id) } });
    if (!log) return { updated: false, reason: 'UNKNOWN_MESSAGE' };
    const mapped = mapDeliveryStatus(status);
    const final = ['DELIVERED', 'FAILED'];
    if (final.includes(log.status) && !final.includes(mapped)) return { updated: false, reason: 'ALREADY_FINAL', status: log.status };
    if (log.status === mapped && log.providerStatus === String(status)) return { updated: false, reason: 'DUPLICATE', status: log.status };
    const updated = await prisma.notificationLog.update({
      where: { id: log.id },
      data: {
        status: mapped, providerStatus: String(status),
        error: mapped === 'FAILED' ? (failureReason || String(status)) : log.error,
        deliveredAt: mapped === 'DELIVERED' ? new Date() : log.deliveredAt,
      },
    });
    if (log.notificationId) await prisma.notification.update({ where: { id: log.notificationId }, data: { status: mapped } }).catch(() => {});
    return { updated: true, status: updated.status };
  },

  status() {
    return { provider: client.name, configured: client.configured };
  },
};
