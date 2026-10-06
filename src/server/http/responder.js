import fs from 'node:fs/promises';

const TYPES = { 'text/plain': 'text/plain; charset=utf-8', text: 'text/plain; charset=utf-8', json: 'application/json; charset=utf-8', html: 'text/html; charset=utf-8' };

/** An Express-`res`-shaped recorder. Controllers call it exactly as before; toResponse() turns it into a Web Response. */
export function createResponder() {
  const state = { status: 200, headers: new Headers(), body: null, file: null, sent: false };
  const res = {
    state,
    get headersSent() { return state.sent; },
    status(code) { state.status = code; return res; },
    setHeader(name, value) { state.headers.set(name, String(value)); return res; },
    set(name, value) {
      if (typeof name === 'object') for (const [k, v] of Object.entries(name)) state.headers.set(k, String(v));
      else state.headers.set(name, String(value));
      return res;
    },
    type(type) { state.headers.set('Content-Type', TYPES[type] || type); return res; },
    json(obj) {
      if (!state.headers.has('Content-Type')) state.headers.set('Content-Type', TYPES.json);
      state.body = JSON.stringify(obj);
      state.sent = true;
      return res;
    },
    send(body) {
      if (body !== null && typeof body === 'object' && !Buffer.isBuffer(body)) return res.json(body);
      if (!state.headers.has('Content-Type')) state.headers.set('Content-Type', TYPES.html);
      state.body = body ?? '';
      state.sent = true;
      return res;
    },
    sendFile(filePath, callback) { state.file = { filePath, callback }; return res; },
  };
  return res;
}

export async function toResponse(res) {
  const { state } = res;
  if (state.file) {
    const { filePath, callback } = state.file;
    state.file = null;
    try {
      const data = await fs.readFile(filePath);
      state.sent = true;
      return new Response(data, { status: state.status, headers: state.headers });
    } catch (err) {
      callback?.(err);
      if (!state.sent) return toResponse(res);
    }
  }
  if (!state.sent) {
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } }, { status: 500 });
  }
  return new Response(state.body, { status: state.status, headers: state.headers });
}
