import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createResponder, toResponse } from '../../../src/server/http/responder.js';

describe('responder', () => {
  test('status().json() → JSON Response', async () => {
    const res = createResponder();
    res.status(201).json({ success: true });
    const r = await toResponse(res);
    expect(r.status).toBe(201);
    expect(r.headers.get('content-type')).toMatch(/application\/json/);
    expect(await r.json()).toEqual({ success: true });
    expect(res.headersSent).toBe(true);
  });

  test('type(text/plain).send() → plain text', async () => {
    const res = createResponder();
    res.status(200).type('text/plain').send('CON Karibu');
    const r = await toResponse(res);
    expect(r.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await r.text()).toBe('CON Karibu');
  });

  test('sendFile streams the file with preset headers', async () => {
    const file = path.join(os.tmpdir(), `resp-${Date.now()}.png`);
    fs.writeFileSync(file, Buffer.from([1, 2, 3]));
    const res = createResponder();
    res.setHeader('Content-Type', 'image/png');
    res.sendFile(file, () => {});
    const r = await toResponse(res);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await r.arrayBuffer())).toEqual(Buffer.from([1, 2, 3]));
  });

  test('sendFile on a missing file runs the callback, which may answer 404', async () => {
    const res = createResponder();
    res.sendFile('/no/such/file', (err) => { if (err && !res.headersSent) res.status(404).json({ success: false }); });
    const r = await toResponse(res);
    expect(r.status).toBe(404);
  });

  test('nothing sent → 500 INTERNAL_ERROR', async () => {
    const r = await toResponse(createResponder());
    expect(r.status).toBe(500);
  });
});
