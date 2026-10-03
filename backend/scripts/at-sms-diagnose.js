#!/usr/bin/env node
/**
 * Diagnose why Africa's Talking is refusing SMS from this backend.
 *
 * Reads AT_* from backend/.env, makes one live SMS send to a phone you pass on the command line, and
 * prints a plain-English report: what was configured, what was sent (no key ever printed), and what
 * AT actually replied. Never uses AT_SMS_DEV_CAPTURE — this hits the real API on purpose.
 *
 *   node scripts/at-sms-diagnose.js +255773096264
 *   node scripts/at-sms-diagnose.js +255773096264 "Hello from MwaniMlinzi"
 */
import { env } from '../src/config/env.js';

const to = process.argv[2];
const message = process.argv[3] || `MwaniMlinzi diagnose ${new Date().toISOString()}`;

if (!to) {
  console.error('usage: node scripts/at-sms-diagnose.js <+255XXXXXXXXX> [message]');
  process.exit(2);
}

const at = env.africastalking;
const host = at.environment === 'production' ? 'https://api.africastalking.com' : 'https://api.sandbox.africastalking.com';

const mask = (s) => (s ? `${s.length} chars: ${s.slice(0, 4)}…${s.slice(-4)}` : '(empty)');

console.log('--- Africa\'s Talking SMS diagnose ---');
console.log('environment  :', at.environment);
console.log('host         :', host);
console.log('AT_USERNAME  :', at.username || '(empty)');
console.log('AT_API_KEY   :', mask(at.apiKey));
console.log('AT_SENDER_ID :', at.senderId || '(empty)');
console.log('to           :', to);
console.log('message      :', message);
console.log('-------------------------------------');

if (!at.username || !at.apiKey) {
  console.error('ERROR: AT_USERNAME and/or AT_API_KEY are empty in backend/.env. Fix that first.');
  process.exit(2);
}

const body = new URLSearchParams({ username: at.username, to, message });
if (at.senderId) body.set('from', at.senderId);

const started = Date.now();
let res;
try {
  res = await fetch(`${host}/version1/messaging`, {
    method: 'POST',
    headers: { apiKey: at.apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(15000),
  });
} catch (err) {
  console.error(`NETWORK ERROR after ${Date.now() - started}ms:`, err.message);
  process.exit(1);
}

const text = await res.text().catch(() => '');
console.log(`HTTP ${res.status} ${res.statusText}  (${Date.now() - started}ms)`);
console.log('response body:');
console.log(text || '(empty)');
console.log('-------------------------------------');

if (res.status === 401) {
  console.error('DIAGNOSIS: AT rejected the credentials (401).');
  console.error('Fix in order:');
  console.error('  1. Confirm AT_USERNAME is exactly "sandbox" for the sandbox app (not your account email).');
  console.error('  2. Regenerate the API key at https://account.africastalking.com/apps/sandbox/settings/key');
  console.error('     and paste the NEW value into backend/.env (AT_API_KEY=…), no quotes, no trailing spaces.');
  console.error('  3. Confirm AT_ENVIRONMENT matches the app (sandbox key => sandbox; production key => production).');
  console.error('  4. Restart the backend.');
  process.exit(1);
}

if (!res.ok) {
  console.error(`DIAGNOSIS: HTTP ${res.status} — AT rejected the request. See the response body above.`);
  process.exit(1);
}

try {
  const data = JSON.parse(text);
  const r = data?.SMSMessageData?.Recipients?.[0];
  if (r) {
    console.log(`RESULT: statusCode=${r.statusCode} status=${r.status} messageId=${r.messageId || '(none)'} cost=${r.cost || '(none)'}`);
    console.log('SUCCESS. Check the AT sandbox simulator (SMS tab) for the phone number you dialled with.');
  } else {
    console.log('DIAGNOSIS: AT returned no recipient — see SMSMessageData.Message above.');
  }
} catch (err) {
  console.error('Response was not JSON:', err.message);
  process.exit(1);
}
