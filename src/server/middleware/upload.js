import { env } from '../config/env.js';
import { UploadError } from '../http/errors.js';
import { readLimitedBuffer } from '../http/body.js';

const HEADROOM = 1024 * 1024; // multipart boundaries + text fields
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

/** multer.memoryStorage().single(field) equivalent: { fieldname, originalname, mimetype, size, buffer } on req.file. */
export const uploadSingle = (field, { maxBytes = env.maxUploadBytes } = {}) => async (req) => {
  const type = (req.request.headers.get('content-type') || '').toLowerCase();
  if (!type.startsWith('multipart/form-data')) return;
  let form;
  const raw = await readLimitedBuffer(req.request, maxBytes + HEADROOM, () => new UploadError('LIMIT_FILE_SIZE'));
  try {
    form = await new Response(raw, { headers: { 'content-type': req.request.headers.get('content-type') } }).formData();
  } catch { throw new Error('Malformed multipart body'); } // busboy parse errors were a 500 under Express
  const files = [];
  const body = {};
  for (const [name, value] of form) {
    if (typeof value === 'string') { body[name] = Object.hasOwn(body, name) ? [].concat(body[name], value) : value; continue; }
    if (name !== field) throw new UploadError('LIMIT_UNEXPECTED_FILE');
    files.push(value);
  }
  if (files.length > 1) throw new UploadError('LIMIT_FILE_COUNT');
  req.body = body;
  const [file] = files;
  if (!file || !ALLOWED.includes(file.type)) return;
  if (file.size > maxBytes) throw new UploadError('LIMIT_FILE_SIZE');
  req.file = { fieldname: field, originalname: file.name || 'upload', mimetype: file.type, size: file.size, buffer: Buffer.from(await file.arrayBuffer()) };
};
