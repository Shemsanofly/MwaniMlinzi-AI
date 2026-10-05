import { events } from '../db/records.js';
import crypto from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env.js';
import prisma from '../config/prisma.js';
import { WhatsAppService } from '../services/whatsappService.js';
import { maskPhone } from '../utils/phone.js';

/**
 * Sarufi WhatsApp webhook. Sarufi POSTs one JSON body per inbound WhatsApp message; we reply with
 * `{ message: "..." }` (or `{ actions: [{ send_message: "..." }] }` — accepted for compatibility with
 * Sarufi's action-based bots). Sarufi then forwards the reply to WhatsApp.
 *
 * Sarufi's payload keys vary slightly across their SDK generations. This handler accepts several common
 * shapes so a future SDK bump does not silently break the pipe:
 *   { chat_id, message, phone_number }               ← the current Python/JS SDK
 *   { user_id, text, from }                          ← older docs
 *   { channel: "whatsapp", data: { message, phone } }← webhook-forwarder shape
 * All get flattened to { chatId, phone, message } for the service.
 */

// Sarufi does not sign its webhooks, so a shared secret in the query string guards the endpoint.
const inbound = z.object({
  chat_id: z.union([z.string(), z.number()]).optional(),
  user_id: z.union([z.string(), z.number()]).optional(),
  message: z.string().optional(),
  text: z.string().optional(),
  phone_number: z.string().optional(),
  phone: z.string().optional(),
  from: z.string().optional(),
  channel: z.string().optional(),
  data: z.any().optional(),
}).passthrough();

function flatten(body) {
  const d = body?.data && typeof body.data === 'object' ? body.data : {};
  return {
    chatId: body.chat_id ?? body.user_id ?? d.chat_id ?? d.user_id ?? null,
    phone: body.phone_number ?? body.phone ?? body.from ?? d.phone_number ?? d.phone ?? d.from ?? '',
    message: body.message ?? body.text ?? d.message ?? d.text ?? '',
  };
}

function secretOk(req) {
  const expected = env.sarufi.webhookSecret;
  if (!expected) return false;
  const given = String(req.query.secret || req.get('x-callback-secret') || '');
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b) && given.length > 0;
}

async function logEvent(data) {
  try {
    await events(prisma, 'INTEGRATION').create({ data: { provider: 'SARUFI', ...data } });
  } catch (err) {
    console.warn('[sarufi] could not log event:', err.message);
  }
}

/** GET /api/integrations/sarufi/webhook — health check used by Sarufi's "Test connection" button. */
export async function health(req, res) {
  if (!env.sarufi.webhookSecret) return res.status(503).json({ ok: false, error: 'SARUFI_WEBHOOK_SECRET not configured' });
  if (!secretOk(req)) return res.status(403).json({ ok: false, error: 'Invalid secret' });
  return res.status(200).json({ ok: true, bot: env.sarufi.botPhone || null });
}

/** POST /api/integrations/sarufi/webhook — one inbound WhatsApp message. */
export async function webhook(req, res) {
  const started = Date.now();
  if (!env.sarufi.webhookSecret) {
    await logEvent({ kind: 'WHATSAPP_INBOUND', status: 'REJECTED', error: 'SARUFI_WEBHOOK_SECRET not configured' });
    return res.status(503).json({ error: 'not_configured' });
  }
  if (!secretOk(req)) {
    await logEvent({ kind: 'WHATSAPP_INBOUND', status: 'REJECTED', error: 'Invalid webhook secret' });
    return res.status(403).json({ error: 'forbidden' });
  }
  const parsed = inbound.safeParse(req.body || {});
  if (!parsed.success) {
    await logEvent({ kind: 'WHATSAPP_INBOUND', status: 'REJECTED', error: 'Invalid payload', payload: { fields: Object.keys(req.body || {}) } });
    return res.status(400).json({ error: 'invalid_payload' });
  }
  const { chatId, phone, message } = flatten(parsed.data);
  if (!phone || !message) {
    await logEvent({ kind: 'WHATSAPP_INBOUND', status: 'REJECTED', error: 'Missing phone or message', payload: { chatId, hasPhone: Boolean(phone), hasMessage: Boolean(message) } });
    return res.status(400).json({ error: 'missing_phone_or_message' });
  }
  let result;
  try {
    result = await WhatsAppService.handle({ chatId, phone, message });
  } catch (err) {
    console.warn(`[sarufi] handle failed for ${maskPhone(phone)}:`, err.message);
    await logEvent({ kind: 'WHATSAPP_INBOUND', reference: chatId ? String(chatId) : null, phoneNumber: maskPhone(phone), status: 'ERROR', error: err.message.slice(0, 500), durationMs: Date.now() - started });
    return res.status(200).json({ message: 'Samahani, kuna tatizo. Tafadhali jaribu tena baadaye.' });
  }
  await logEvent({
    kind: 'WHATSAPP_INBOUND',
    reference: chatId ? String(chatId) : null,
    phoneNumber: maskPhone(phone),
    status: 'OK',
    payload: { message: String(message).slice(0, 500), kind: result.kind },
    response: result.reply.slice(0, 500),
    durationMs: Date.now() - started,
  });
  // Sarufi accepts either { message } or { actions: [{ send_message }] }; { message } is the current SDK.
  return res.status(200).json({ message: result.reply, actions: [{ send_message: result.reply }] });
}
