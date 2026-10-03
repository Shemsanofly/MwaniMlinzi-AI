import { atConfig } from './config.js';

/**
 * Africa's Talking SMS client (REST: POST {host}/version1/messaging).
 * Returns one normalised result per recipient. Never reports success it did not receive:
 *   QUEUED  — accepted by Africa's Talking (status codes 100 Processed / 102 Queued)
 *   SENT    — handed to the network (101 Sent); delivery is confirmed later by a delivery report
 *   FAILED  — rejected (4xx/5xx status codes, HTTP or network errors)
 *   NOT_CONFIGURED — AT_USERNAME / AT_API_KEY missing (nothing was sent)
 */
const STATUS_BY_CODE = { 100: 'QUEUED', 101: 'SENT', 102: 'QUEUED' };

export class AfricasTalkingSMSClient {
  constructor(cfg) {
    this.cfg = atConfig(cfg);
    this.name = this.cfg.smsDevCapture ? `africastalking-${this.cfg.environment}-devcapture` : `africastalking-${this.cfg.environment}`;
    if (this.cfg.smsDevCapture) {
      // Loud so nobody forgets it's on and later mistakes the fake QUEUED for a real delivery.
      console.warn('[africastalking] AT_SMS_DEV_CAPTURE is ON: SMS is captured to notification_logs and NOT sent to Africa\'s Talking. Turn it off for real delivery.');
    }
  }

  get configured() { return this.cfg.smsConfigured; }

  async send(to, message, { linkId = null, fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
    if (this.cfg.smsDevCapture) {
      // No network call — the SMS is recorded in notification_logs by SMSService.sendRaw. Everything
      // downstream (admin panel, delivery-status tracking) treats it as a normal QUEUED message. No
      // delivery report will ever arrive, so it stays QUEUED (documented on the admin panel too).
      return { status: 'QUEUED', providerRef: `ATXid_devcap_${Date.now()}`, providerStatus: '102 DevCapture', cost: 'TZS 0.0000' };
    }
    if (!this.configured) return { status: 'NOT_CONFIGURED', error: "Africa's Talking is not configured (set AT_USERNAME and AT_API_KEY)" };
    const body = new URLSearchParams({ username: this.cfg.username, to, message });
    if (this.cfg.senderId) body.set('from', this.cfg.senderId);
    if (linkId) body.set('linkId', linkId); // reply to an inbound premium/shortcode message
    let res;
    try {
      res = await fetchImpl(`${this.cfg.host}/version1/messaging`, {
        method: 'POST',
        headers: { apiKey: this.cfg.apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      return { status: 'FAILED', error: `Network error contacting Africa's Talking: ${err.message}` };
    }
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      const bodyPreview = (text || '').trim().slice(0, 200) || '<empty response>';
      const reason = res.status === 401
        // The three ways this fails most often, in the order to check them, so admins can act without guessing.
        // AT's own response body is included so you don't have to guess why they refused.
        ? `Authentication failed (HTTP 401 from ${this.cfg.host}). AT said: "${bodyPreview}". Verify: (1) AT_API_KEY was generated for this app in the AT dashboard and pasted with no extra whitespace; (2) AT_USERNAME='${this.cfg.username}' matches that app's username; (3) AT_ENVIRONMENT='${this.cfg.environment}' matches (a sandbox key never works with production and vice versa). Regenerate the key at https://account.africastalking.com/apps/sandbox/settings/key, paste it into backend/.env, and restart the API.`
        : `HTTP ${res.status}: ${bodyPreview}`;
      return { status: 'FAILED', error: reason, httpStatus: res.status };
    }
    let data;
    try { data = JSON.parse(text); } catch { return { status: 'UNKNOWN', error: `Unexpected response: ${text.slice(0, 200)}` }; }
    const r = data?.SMSMessageData?.Recipients?.[0];
    if (!r) return { status: 'FAILED', error: data?.SMSMessageData?.Message || 'No recipient in response' };
    const status = STATUS_BY_CODE[r.statusCode] || 'FAILED';
    return {
      status,
      providerRef: r.messageId && r.messageId !== 'None' ? r.messageId : null,
      providerStatus: `${r.statusCode} ${r.status}`,
      cost: r.cost || null,
      error: status === 'FAILED' ? `${r.status} (${r.statusCode})` : null,
    };
  }
}

/** Delivery report status → our DeliveryStatus. */
export function mapDeliveryStatus(atStatus) {
  const s = String(atStatus || '').toLowerCase();
  if (s === 'success') return 'DELIVERED';
  if (['failed', 'rejected', 'absentsubscriber', 'expired'].includes(s)) return 'FAILED';
  if (['sent', 'submitted', 'buffered'].includes(s)) return 'SENT';
  return 'UNKNOWN';
}
