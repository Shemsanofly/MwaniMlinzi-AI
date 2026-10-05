import { createContext } from '../../../src/server/http/context.js';
import { parseBody } from '../../../src/server/http/body.js';

const ctxFor = (body, type) => createContext(new Request('http://l/api/x', { method: 'POST', body, headers: type ? { 'content-type': type } : {} }), {});

describe('parseBody', () => {
  test('JSON object', async () => { const c = ctxFor('{"a":1}', 'application/json'); await parseBody(c); expect(c.body).toEqual({ a: 1 }); });
  test('JSON with charset', async () => { const c = ctxFor('[1]', 'application/json; charset=utf-8'); await parseBody(c); expect(c.body).toEqual([1]); });
  test('empty JSON body → {}', async () => { const c = ctxFor('', 'application/json'); await parseBody(c); expect(c.body).toEqual({}); });
  test('malformed JSON → entity.parse.failed', async () => { await expect(parseBody(ctxFor('{bad', 'application/json'))).rejects.toMatchObject({ type: 'entity.parse.failed' }); });
  test('non-object JSON (strict) → entity.parse.failed', async () => { await expect(parseBody(ctxFor('"x"', 'application/json'))).rejects.toMatchObject({ type: 'entity.parse.failed' }); });
  test('JSON over 200kb → entity.too.large', async () => {
    await expect(parseBody(ctxFor(JSON.stringify({ a: 'x'.repeat(205000) }), 'application/json'))).rejects.toMatchObject({ type: 'entity.too.large' });
  });
  test('urlencoded with repeated keys', async () => {
    const c = ctxFor('text=1*2&phoneNumber=%2B255&x=a&x=b', 'application/x-www-form-urlencoded');
    await parseBody(c);
    expect(c.body).toEqual({ text: '1*2', phoneNumber: '+255', x: ['a', 'b'] });
  });
  test('urlencoded over 50kb → entity.too.large', async () => {
    await expect(parseBody(ctxFor(`a=${'x'.repeat(52000)}`, 'application/x-www-form-urlencoded'))).rejects.toMatchObject({ type: 'entity.too.large' });
  });
  test('no content-type → body stays undefined', async () => { const c = ctxFor('hello'); await parseBody(c); expect(c.body).toBeUndefined(); });
  test('multipart is left for the upload step', async () => { const c = ctxFor('--x--', 'multipart/form-data; boundary=x'); await parseBody(c); expect(c.body).toBeUndefined(); });
  test('GET is not parsed', async () => { const c = createContext(new Request('http://l/api/x'), {}); await parseBody(c); expect(c.body).toBeUndefined(); });
});
