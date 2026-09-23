import { env } from '../config/env.js';

/**
 * SMSProvider interface: { name, isLive, send(to, message) → { status: 'SENT'|'SIMULATED'|'FAILED', providerRef?, error? } }
 */
export class SimulatedSMSProvider {
  name = 'simulated-sms';
  isLive = false;
  async send(to) { return { status: 'SIMULATED', providerRef: `sim-${Date.now()}-${String(to).slice(-4)}` }; }
}

/** Africa's Talking bulk SMS — requires SMS_API_KEY and SMS_USERNAME. */
export class AfricasTalkingSMSProvider {
  name = 'africastalking';
  isLive = true;
  constructor({ apiKey, username, senderId }) { Object.assign(this, { apiKey, username, senderId }); }
  async send(to, message) {
    try {
      const host = this.username === 'sandbox' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
      const body = new URLSearchParams({ username: this.username, to, message, ...(this.senderId ? { from: this.senderId } : {}) });
      const res = await fetch(`https://${host}/version1/messaging`, {
        method: 'POST',
        headers: { apiKey: this.apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { status: 'FAILED', error: `HTTP ${res.status}` };
      const d = await res.json();
      const r = d.SMSMessageData?.Recipients?.[0];
      return r?.status === 'Success' ? { status: 'SENT', providerRef: r.messageId } : { status: 'FAILED', error: r?.status || 'Unknown' };
    } catch (err) {
      return { status: 'FAILED', error: err.message };
    }
  }
}

export function createSMSProvider(config = env) {
  if (!config.demoMode && config.sms.provider === 'africastalking' && config.sms.apiKey && config.sms.username) {
    return new AfricasTalkingSMSProvider(config.sms);
  }
  return new SimulatedSMSProvider();
}
