import { createContext } from '../../../src/server/http/context.js';
import { UploadError } from '../../../src/server/http/errors.js';
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

describe('uploadSingle streaming and malformed bodies', () => {
  test('oversized multipart stream → LIMIT_FILE_SIZE, cancelled early', async () => {
    const state = { pulled: 0, cancelled: false };
    const chunk = new Uint8Array(64 * 1024);
    const stream = new ReadableStream({
      pull(controller) {
        if (state.pulled >= 200) { controller.close(); return; }
        state.pulled += 1;
        controller.enqueue(chunk);
      },
      cancel() { state.cancelled = true; },
    });
    const c = createContext(new Request('http://l/api/uploads', { method: 'POST', body: stream, duplex: 'half', headers: { 'content-type': 'multipart/form-data; boundary=x' } }), {});
    await expect(uploadSingle('image', { maxBytes: 1024 })(c)).rejects.toMatchObject({ code: 'LIMIT_FILE_SIZE' });
    expect(state.pulled).toBeLessThan(200);
    expect(state.cancelled).toBe(true);
  });
  test('malformed multipart → plain Error (500 parity), not UploadError', async () => {
    const c = createContext(new Request('http://l/api/uploads', { method: 'POST', body: 'garbage', headers: { 'content-type': 'multipart/form-data; boundary=x' } }), {});
    const err = await uploadSingle('image', { maxBytes: 1024 })(c).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(UploadError);
    expect(err.message).toBe('Malformed multipart body');
  });
});
