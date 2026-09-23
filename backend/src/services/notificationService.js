import prisma from '../config/prisma.js';
import { createSMSProvider } from '../providers/smsProvider.js';
import { createEmailProvider } from '../providers/emailProvider.js';
import { getSetting } from './settingsService.js';

let smsProvider = createSMSProvider();
const emailProvider = createEmailProvider();
export const setSMSProvider = (p) => { smsProvider = p; };
export const getSMSProvider = () => smsProvider;

/**
 * NotificationService — delivers alerts over IN_APP, SMS and EMAIL channels and logs every attempt
 * in `notification_logs`. SMS/email are simulated unless a live provider is configured.
 */
export const NotificationService = {
  async notifyUser(user, { title, body, alertId = null, channels = ['IN_APP'] }) {
    const results = [];
    for (const channel of channels) {
      if (channel === 'SMS' && (!user.phone || !(await getSetting('notifications.smsEnabled')))) continue;
      const notification = await prisma.notification.create({ data: { userId: user.id, alertId, channel, title, body } });
      if (channel === 'IN_APP') {
        results.push(notification);
        continue;
      }
      const provider = channel === 'SMS' ? smsProvider : emailProvider;
      const recipient = channel === 'SMS' ? user.phone : user.email;
      let outcome;
      try {
        outcome = await provider.send(recipient, `${title}: ${body}`.slice(0, 459));
      } catch (err) {
        outcome = { status: 'FAILED', error: err.message };
      }
      await prisma.notificationLog.create({
        data: { notificationId: notification.id, channel, provider: provider.name, recipient, status: outcome.status, providerRef: outcome.providerRef || null, error: outcome.error || null },
      });
      if (channel === 'SMS' && outcome.status !== 'FAILED') {
        await prisma.smsMessage.create({ data: { direction: 'OUTBOUND', phoneNumber: recipient, body: `${title}: ${body}`.slice(0, 459), command: 'ALERT', simulated: outcome.status === 'SIMULATED' } });
      }
      results.push(notification);
    }
    return results;
  },

  async listForUser(userId, { unreadOnly = false, take = 50 } = {}) {
    return prisma.notification.findMany({
      where: { userId, channel: 'IN_APP', ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take,
    });
  },
};
