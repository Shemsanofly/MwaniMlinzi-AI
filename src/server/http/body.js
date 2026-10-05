import { parseQuery } from './context.js';

const JSON_LIMIT = 200 * 1024; // express.json({ limit: '200kb' })
const FORM_LIMIT = 50 * 1024; // express.urlencoded({ limit: '50kb' })
const parseError = (type) => Object.assign(new Error(type), { type });

const mediaType = (request) => (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();

async function readLimited(request, limit) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) throw parseError('entity.too.large');
  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length > limit) throw parseError('entity.too.large');
  return buf.toString('utf8');
}

/** Same behaviour as Express 5's json + urlencoded parsers: unmatched content types leave body undefined. */
export async function parseBody(ctx) {
  const { request } = ctx;
  if (request.method === 'GET' || request.method === 'HEAD' || !request.body) return;
  const type = mediaType(request);
  if (type === 'application/json') {
    const text = await readLimited(request, JSON_LIMIT);
    if (!text.trim()) { ctx.body = {}; return; }
    if (!/^[\s]*[[{]/.test(text)) throw parseError('entity.parse.failed'); // strict mode
    try { ctx.body = JSON.parse(text); } catch { throw parseError('entity.parse.failed'); }
  } else if (type === 'application/x-www-form-urlencoded') {
    ctx.body = parseQuery(new URLSearchParams(await readLimited(request, FORM_LIMIT)));
  }
}
