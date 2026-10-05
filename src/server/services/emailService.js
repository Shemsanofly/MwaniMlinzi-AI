import prisma from '../config/prisma.js';
import { events } from '../db/records.js';
import { createEmailProvider } from '../providers/emailProvider.js';

let provider = createEmailProvider();
export const getEmailProvider = () => provider;
export const setEmailProvider = (value) => { provider = value; };

const resetMessage = {
  en: (code) => ({
    subject: 'MwaniMlinzi — password reset code',
    text: `Your MwaniMlinzi password reset code is ${code}. It expires in 15 minutes. Do not share it with anyone. If you did not request a password reset, you can ignore this email.`,
  }),
  sw: (code) => ({
    subject: 'MwaniMlinzi — namba ya kubadilisha nenosiri',
    text: `Namba yako ya kubadilisha nenosiri la MwaniMlinzi ni ${code}. Inaisha baada ya dakika 15. Usimpe mtu yeyote. Kama hukuomba kubadilisha nenosiri, puuza barua pepe hii.`,
  }),
};

export const EmailService = {
  isConfigured: () => provider.configured === true,

  async sendPasswordReset(user, code) {
    const language = user.preferredLanguage === 'sw' ? 'sw' : 'en';
    let result;
    try {
      result = await provider.send({ to: user.email, ...resetMessage[language](code) });
    } catch {
      result = { status: 'FAILED', error: 'EMAIL_SEND_FAILED' };
    }
    // Keep delivery metadata; the one-time secret never reaches logs or responses.
    await events(prisma, 'DELIVERY').create({
      data: {
        channel: 'EMAIL', provider: provider.name, recipient: user.email,
        status: result.status, providerRef: result.providerRef || null,
        messageType: 'PASSWORD_RESET', language,
        message: resetMessage[language]('******').text,
        error: result.error || null,
        sentAt: result.status === 'SENT' ? new Date() : null,
      },
    });
    return result;
  },
};
