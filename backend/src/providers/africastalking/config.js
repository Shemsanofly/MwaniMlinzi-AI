import { env } from '../../config/env.js';

/** Africa's Talking configuration + status (never exposes the API key). */
export function atConfig(cfg = env.africastalking) {
  const smsConfigured = Boolean(cfg.username && cfg.apiKey);
  return {
    ...cfg,
    smsConfigured,
    ussdConfigured: Boolean(cfg.callbackSecret),
    host: cfg.environment === 'production' ? 'https://api.africastalking.com' : 'https://api.sandbox.africastalking.com',
  };
}

export function atPublicStatus(cfg = env.africastalking) {
  const c = atConfig(cfg);
  const base = env.publicApiUrl || '<PUBLIC_API_URL>';
  const q = c.callbackSecret ? '?secret=<AT_CALLBACK_SECRET>' : '';
  return {
    environment: c.environment.toUpperCase(),
    username: c.username || null,
    apiKeySet: Boolean(c.apiKey),
    senderIdSet: Boolean(c.senderId),
    sms: c.smsConfigured ? 'CONFIGURED' : 'NOT_CONFIGURED',
    ussd: c.ussdConfigured ? 'CONFIGURED' : 'NOT_CONFIGURED',
    ussdServiceCode: c.ussdServiceCode || null,
    callbackSecretSet: Boolean(c.callbackSecret),
    callbackUrls: {
      ussd: `${base}/api/integrations/africastalking/ussd${q}`,
      smsInbound: `${base}/api/integrations/africastalking/sms${q}`,
      smsDelivery: `${base}/api/integrations/africastalking/sms/delivery${q}`,
    },
    publicApiUrlSet: Boolean(env.publicApiUrl),
  };
}
