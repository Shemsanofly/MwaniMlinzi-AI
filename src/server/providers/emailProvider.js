import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

export class NotConfiguredEmailProvider {
  name = 'email-not-configured';
  isLive = false;
  configured = false;
  async send() { return { status: 'NOT_CONFIGURED', error: 'Email delivery is not configured' }; }
}

/** SMTP acceptance means SENT; inbox delivery is not confirmed by SMTP. */
export class SmtpEmailProvider {
  name = 'smtp-email';
  isLive = true;
  configured = true;

  constructor(config, transport = null) {
    this.from = config.from;
    this.transport = transport || nodemailer.createTransport({
      host: config.host, port: config.port, secure: config.secure,
      requireTLS: config.requireTLS,
      ...(config.user ? { auth: { user: config.user, pass: config.password } } : {}),
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
      disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
    });
  }

  async send({ to, subject, text }) {
    try {
      const result = await this.transport.sendMail({ from: this.from, to, subject, text });
      if (!result.accepted?.some((address) => String(address).toLowerCase() === to.toLowerCase())) {
        return { status: 'FAILED', error: 'EMAIL_REJECTED' };
      }
      return { status: 'SENT', providerRef: result.messageId || null };
    } catch (err) {
      // Raw SMTP errors can contain message content or credentials.
      const error = err.code === 'EAUTH' ? 'EMAIL_AUTH_FAILED'
        : err.code === 'ETIMEDOUT' ? 'EMAIL_TIMEOUT' : 'EMAIL_SEND_FAILED';
      return { status: 'FAILED', error };
    }
  }
}

export function createEmailProvider(config = env.email) {
  const valid = config.host && config.from && Number.isInteger(config.port) && config.port > 0 && config.port <= 65535
    && Boolean(config.user) === Boolean(config.password);
  return valid ? new SmtpEmailProvider(config) : new NotConfiguredEmailProvider();
}
