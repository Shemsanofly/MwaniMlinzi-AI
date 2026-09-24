/**
 * EmailProvider abstraction. Email delivery is not implemented in this version, so the provider
 * reports NOT_CONFIGURED instead of pretending to send. Plug an SMTP/API provider in here later.
 */
export class NotConfiguredEmailProvider {
  name = 'email-not-configured';
  isLive = false;
  async send() { return { status: 'NOT_CONFIGURED', error: 'Email delivery is not configured' }; }
}
export const createEmailProvider = () => new NotConfiguredEmailProvider();
