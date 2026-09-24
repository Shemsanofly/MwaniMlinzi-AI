import crypto from 'node:crypto';
import { z } from 'zod';
import prisma from '../config/prisma.js';
import { atConfig } from '../providers/africastalking/config.js';
import { UssdService } from '../services/ussdService.js';
import { ChannelService } from '../services/channelService.js';
import { SMSService } from '../services/smsService.js';
import { runInBackground } from '../utils/background.js';
import { maskPhone } from '../utils/phone.js';

/**
 * Africa's Talking callbacks (form-urlencoded POSTs from AT's servers).
 * AT does not sign callbacks, so every callback URL carries a shared secret:
 *   https://<PUBLIC_API_URL>/api/integrations/africastalking/ussd?secret=<AT_CALLBACK_SECRET>
 * (or the X-Callback-Secret header). The secret is compared in constant time and redacted from logs.
 */

const str = (max) => z.string().trim().max(max);
const ussdSchema = z.object({
  sessionId: str(128).min(1),
  phoneNumber: str(32).min(5),
  serviceCode: str(64).optional(),
  networkCode: str(32).optional(),
  text: z.string().max(500).optional().default(''),
});
const smsInboundSchema = z.object({
  from: str(32).min(5),
  text: z.string().max(2000).default(''),
  to: str(32).optional(),
  id: str(128).optional(),
  linkId: str(128).optional(),
  date: str(64).optional(),
});
const deliverySchema = z.object({
  id: str(128).min(1),
  status: str(64).min(1),
  phoneNumber: str(32).optional(),
  networkCode: str(32).optional(),
  failureReason: str(200).optional(),
  retryCount: z.union([z.string(), z.number()]).optional(),
});

function secretOk(req) {
  const expected = atConfig().callbackSecret;
  if (!expected) return false;
  const given = String(req.query.secret || req.get('x-callback-secret') || '');
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b) && given.length > 0;
}

async function logEvent(data) {
  try {
    await prisma.integrationEvent.create({ data: { provider: 'AFRICASTALKING', ...data } });
  } catch (err) {
    console.warn('[integrations] could not log event:', err.message);
  }
}

/** Common guard: configured + secret. Returns true when the request was already answered. */
function rejectUnauthorized(req, res, kind, { ussd = false } = {}) {
  if (!atConfig().callbackSecret) {
    logEvent({ kind, status: 'REJECTED', error: 'AT_CALLBACK_SECRET not configured' });
    res.status(503).type('text/plain').send(ussd ? 'END Service is not configured. Please try again later.' : 'NOT_CONFIGURED');
    return true;
  }
  if (!secretOk(req)) {
    logEvent({ kind, status: 'REJECTED', error: 'Invalid callback secret' });
    res.status(403).type('text/plain').send(ussd ? 'END Access denied.' : 'FORBIDDEN');
    return true;
  }
  return false;
}

/* ───────────── USSD ───────────── */

export async function ussd(req, res) {
  const started = Date.now();
  if (rejectUnauthorized(req, res, 'USSD', { ussd: true })) return;
  const parsed = ussdSchema.safeParse(req.body || {});
  if (!parsed.success) {
    await logEvent({ kind: 'USSD', status: 'REJECTED', error: 'Invalid USSD payload', payload: { fields: Object.keys(req.body || {}) } });
    return res.status(400).type('text/plain').send('END Invalid request.');
  }
  const body = parsed.data;
  const expectedCode = atConfig().ussdServiceCode;
  if (expectedCode && body.serviceCode && body.serviceCode !== expectedCode) {
    await logEvent({ kind: 'USSD', reference: body.sessionId, status: 'REJECTED', error: `Unexpected service code ${body.serviceCode}` });
    return res.status(200).type('text/plain').send('END Unknown service.');
  }
  let result;
  try {
    result = await UssdService.handle(body);
  } catch (err) {
    console.warn(`[ussd] session ${body.sessionId} (${maskPhone(body.phoneNumber)}) failed:`, err.message);
    await logEvent({ kind: 'USSD', reference: body.sessionId, phoneNumber: maskPhone(body.phoneNumber), status: 'ERROR', error: err.message.slice(0, 500), durationMs: Date.now() - started });
    return res.status(200).type('text/plain').send('END Samahani, kuna hitilafu. Tafadhali jaribu tena baadaye.');
  }
  await logEvent({
    kind: 'USSD', reference: body.sessionId, phoneNumber: maskPhone(body.phoneNumber),
    status: result.duplicate ? 'DUPLICATE' : 'OK',
    payload: { serviceCode: body.serviceCode || null, networkCode: body.networkCode || null, text: body.text, menu: result.menu },
    response: result.response.slice(0, 500), durationMs: Date.now() - started,
  });
  return res.status(200).type('text/plain').send(result.response);
}

/* ───────────── Inbound SMS ───────────── */

export async function smsInbound(req, res) {
  const started = Date.now();
  if (rejectUnauthorized(req, res, 'SMS_INBOUND')) return;
  const parsed = smsInboundSchema.safeParse(req.body || {});
  if (!parsed.success) {
    await logEvent({ kind: 'SMS_INBOUND', status: 'REJECTED', error: 'Invalid SMS payload', payload: { fields: Object.keys(req.body || {}) } });
    return res.status(400).type('text/plain').send('INVALID');
  }
  const msg = parsed.data;
  if (msg.id) {
    const seen = await prisma.integrationEvent.findFirst({ where: { kind: 'SMS_INBOUND', reference: msg.id, status: 'OK' } });
    if (seen) {
      await logEvent({ kind: 'SMS_INBOUND', reference: msg.id, phoneNumber: maskPhone(msg.from), status: 'DUPLICATE' });
      return res.status(200).type('text/plain').send('DUPLICATE');
    }
  }
  await logEvent({ kind: 'SMS_INBOUND', reference: msg.id || null, phoneNumber: maskPhone(msg.from), status: 'OK', payload: { to: msg.to || null, text: msg.text.slice(0, 500), linkId: msg.linkId || null } });
  // Answer AT immediately; the reply is sent as a separate outbound SMS.
  runInBackground(async () => {
    const out = await ChannelService.processInboundSms({ from: msg.from, text: msg.text, linkId: msg.linkId || null });
    await logEvent({ kind: 'SMS_SEND', reference: out.send?.providerRef || msg.id || null, phoneNumber: maskPhone(msg.from), status: ['FAILED', 'NOT_CONFIGURED'].includes(out.send?.status) ? 'ERROR' : 'OK', response: `${out.command}: ${out.send?.status}`, error: out.send?.reason || null, durationMs: Date.now() - started });
  }, 'sms-inbound');
  return res.status(200).type('text/plain').send('OK');
}

/* ───────────── Delivery reports ───────────── */

export async function smsDelivery(req, res) {
  if (rejectUnauthorized(req, res, 'SMS_DELIVERY')) return;
  const parsed = deliverySchema.safeParse(req.body || {});
  if (!parsed.success) {
    await logEvent({ kind: 'SMS_DELIVERY', status: 'REJECTED', error: 'Invalid delivery report', payload: { fields: Object.keys(req.body || {}) } });
    return res.status(400).type('text/plain').send('INVALID');
  }
  const report = parsed.data;
  const result = await SMSService.handleDeliveryReport(report);
  await logEvent({
    kind: 'SMS_DELIVERY', reference: report.id, phoneNumber: report.phoneNumber ? maskPhone(report.phoneNumber) : null,
    status: result.updated ? 'OK' : result.reason === 'DUPLICATE' || result.reason === 'ALREADY_FINAL' ? 'DUPLICATE' : 'ERROR',
    payload: { status: report.status, failureReason: report.failureReason || null }, response: result.status || result.reason,
  });
  // Always 200 so AT does not retry reports we cannot match.
  return res.status(200).type('text/plain').send(result.updated ? 'OK' : result.reason);
}
