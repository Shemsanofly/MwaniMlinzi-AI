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
    this.name = `africastalking-${this.cfg.environment}`;
  }

  get configured() { return this.cfg.smsConfigured; }

  async send(to, message, { linkId = null, fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
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
      const reason = res.status === 401 ? 'Authentication failed (check AT_USERNAME / AT_API_KEY / AT_ENVIRONMENT)' : `HTTP ${res.status}: ${text.slice(0, 200)}`;
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
