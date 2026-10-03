import prisma from '../config/prisma.js';
import { SMSService } from './smsService.js';

/**
 * NotificationService — the single place that notifies people.
 * Always creates an IN_APP notification (in the user's language); sends an SMS through SMSService
 * only when `sms` text is given — SMSService then applies opt-in, preference and priority rules.
 */
export const NotificationService = {
  /**
   * @param user  full user row (needs id, phone, preferredLanguage and notification preferences)
   * @param n     { type, priority, source, alertId, title:{en,sw}|string, body:{en,sw}|string, sms?:{en,sw} }
   * @returns { notification, sms }  sms = SMSService result or null
   */
  async notifyUser(user, { type = 'GENERAL', priority = 'INFO', source = null, alertId = null, title, body, sms = null }) {
    const language = user.preferredLanguage === 'en' ? 'en' : 'sw';
    const pick = (v) => (typeof v === 'string' ? v : v?.[language] || v?.sw || v?.en || '');
    const notification = await prisma.notification.create({
      data: { userId: user.id, alertId, channel: 'IN_APP', type, priority, language, source, title: pick(title), body: pick(body) },
    });
    let smsResult = null;
    if (sms) {
      const smsNotification = await prisma.notification.create({
        data: { userId: user.id, alertId, channel: 'SMS', type, priority, language, source, title: pick(title), body: pick(sms), readAt: new Date() },
      });
      smsResult = await SMSService.sendToUser(user, { type, priority, text: sms, notificationId: smsNotification.id });
      if (smsResult.status === 'SKIPPED') {
        await prisma.notification.update({ where: { id: smsNotification.id }, data: { status: 'SKIPPED' } });
      }
    }
    return { notification, sms: smsResult };
  },

  async listForUser(userId, { unreadOnly = false, take = 50 } = {}) {
    return prisma.notification.findMany({
      where: { userId, channel: 'IN_APP', ...(unreadOnly ? { readAt: null } : {}) },
      include: { alert: { select: { id: true, title: true, titleSw: true, message: true, messageSw: true, severity: true, type: true, farmId: true } } },
      orderBy: { createdAt: 'desc' },
      take,
    });
  },
};
