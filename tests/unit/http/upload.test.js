import { createContext } from '../../../src/server/http/context.js';
import { uploadSingle } from '../../../src/server/middleware/upload.js';

const form = (entries) => { const fd = new FormData(); for (const [k, v, name] of entries) (name === undefined ? fd.append(k, v) : fd.append(k, v, name)); return fd; };
const ctxFor = (fd) => createContext(new Request('http://l/api/uploads', { method: 'POST', body: fd }), {});
const png = () => new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });

describe('uploadSingle', () => {
  test('exposes the multer file shape and text fields', async () => {
    const c = ctxFor(form([['image', png(), 'leaf.png'], ['note', 'hi']]));
    await uploadSingle('image', { maxBytes: 1024 })(c);
    expect(c.file).toMatchObject({ fieldname: 'image', originalname: 'leaf.png', mimetype: 'image/png', size: 4 });
    expect(Buffer.isBuffer(c.file.buffer)).toBe(true);
    expect(c.body).toEqual({ note: 'hi' });
  });
  test('disallowed mime is silently dropped (multer fileFilter)', async () => {
    const c = ctxFor(form([['image', new Blob(['x'], { type: 'text/plain' }), 'x.txt']]));
    await uploadSingle('image', { maxBytes: 1024 })(c);
    expect(c.file).toBeUndefined();
  });
  test('too large → UploadError LIMIT_FILE_SIZE', async () => {
    await expect(uploadSingle('image', { maxBytes: 2 })(ctxFor(form([['image', png(), 'a.png']])))).rejects.toMatchObject({ code: 'LIMIT_FILE_SIZE' });
  });
  test('two files → LIMIT_FILE_COUNT; other field → LIMIT_UNEXPECTED_FILE', async () => {
    await expect(uploadSingle('image', { maxBytes: 1024 })(ctxFor(form([['image', png(), 'a.png'], ['image', png(), 'b.png']])))).rejects.toMatchObject({ code: 'LIMIT_FILE_COUNT' });
    await expect(uploadSingle('image', { maxBytes: 1024 })(ctxFor(form([['photo', png(), 'a.png']])))).rejects.toMatchObject({ code: 'LIMIT_UNEXPECTED_FILE' });
  });
  test('non-multipart request → no file, no error', async () => {
    const c = createContext(new Request('http://l/api/uploads', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }), {});
    await uploadSingle('image', { maxBytes: 1024 })(c);
    expect(c.file).toBeUndefined();
  });
});
