import { env } from '../config/env.js';
import { UploadError } from '../http/errors.js';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

/** multer.memoryStorage().single(field) equivalent: { fieldname, originalname, mimetype, size, buffer } on req.file. */
export const uploadSingle = (field, { maxBytes = env.maxUploadBytes } = {}) => async (req) => {
  const type = (req.request.headers.get('content-type') || '').toLowerCase();
  if (!type.startsWith('multipart/form-data')) return;
  let form;
  try { form = await req.request.formData(); } catch { throw new UploadError('Malformed multipart body'); }
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
