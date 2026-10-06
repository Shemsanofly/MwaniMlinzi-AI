import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { matchRoute, patternToDir } from '../src/server/http/routeTable.js';
import { TEST_PASSWORD } from './testDb.js';

const API_DIR = path.join(process.cwd(), 'app', 'api');
const routeFile = (dir) => pathToFileURL(path.join(API_DIR, ...dir.split('/').filter(Boolean), 'route.js')).href;

/** Resolve a URL the way Next's file router does for this app. */
async function resolve(pathname) {
  if (pathname === '/api' || pathname === '/api/') return { mod: await import(routeFile('')), params: {} };
  if (pathname === '/api/docs.json') return { mod: await import(routeFile('docs.json')), params: {} };
  if (pathname === '/api/docs') return { mod: await import(routeFile('docs')), params: {} };
  if (pathname.startsWith('/api/docs/')) return { mod: await import(routeFile('docs/[asset]')), params: { asset: pathname.slice(10) } };
  const hit = matchRoute(pathname);
  if (hit) return { mod: await import(routeFile(patternToDir(hit.pattern))), params: hit.params };
  return { mod: await import(routeFile('[...notFound]')), params: { notFound: pathname.split('/').slice(2) } };
}

const FORM = 'application/x-www-form-urlencoded';

/** The subset of supertest's API the suite uses: set, type, send, attach, field, query; awaitable. */
class TestRequest {
  constructor(method, url) {
    this.method = method; this.url = url; this.headers = {}; this.body = undefined; this.contentType = undefined; this.form = null;
  }
  set(name, value) { if (typeof name === 'object') Object.assign(this.headers, name); else this.headers[name] = value; return this; }
  type(t) { this.contentType = t === 'form' ? FORM : t === 'json' ? 'application/json' : t; return this; }
  query(q) { const u = new URL(this.url, 'http://localhost'); for (const [k, v] of Object.entries(q)) u.searchParams.append(k, v); this.url = `${u.pathname}${u.search}`; return this; }
  send(body) {
    if (body && typeof body === 'object' && this.body && typeof this.body === 'object') Object.assign(this.body, body);
    else this.body = body;
    return this;
  }
  field(name, value) { (this.form ||= new FormData()).append(name, value); return this; }
  attach(field, buffer, opts = {}) {
    const { filename = 'file', contentType = 'application/octet-stream' } = typeof opts === 'string' ? { filename: opts } : opts;
    (this.form ||= new FormData()).append(field, new Blob([buffer], { type: contentType }), filename);
    return this;
  }
  async exec() {
    const headers = new Headers(this.headers);
    let body;
    if (this.form) body = this.form;
    else if (this.body !== undefined) {
      const type = this.contentType || (typeof this.body === 'string' ? (headers.get('content-type') || FORM) : 'application/json');
      if (!headers.has('content-type')) headers.set('content-type', type);
      body = typeof this.body === 'string' ? this.body
        : type === FORM ? new URLSearchParams(Object.entries(this.body).flatMap(([k, v]) => [].concat(v).map((x) => [k, String(x)]))).toString()
          : JSON.stringify(this.body);
    } else if (this.contentType) headers.set('content-type', this.contentType);
    if (!headers.has('x-forwarded-for')) headers.set('x-forwarded-for', '127.0.0.1');
    const request = new Request(`http://localhost${this.url}`, { method: this.method, headers, body });
    const { mod, params } = await resolve(new URL(request.url).pathname);
    const handler = mod[this.method];
    if (!handler) throw new Error(`No ${this.method} export for ${this.url}`);
    const response = await handler(request, { params: Promise.resolve(params) });
    const text = await response.text();
    const isJson = (response.headers.get('content-type') || '').includes('json');
    const out = { status: response.status, statusCode: response.status, headers: Object.fromEntries(response.headers), text, body: isJson && text ? JSON.parse(text) : {} };
    out.header = out.headers;
    out.type = (response.headers.get('content-type') || '').split(';')[0];
    return out;
  }
  then(resolveFn, rejectFn) { return this.exec().then(resolveFn, rejectFn); }
}

const client = Object.fromEntries(['get', 'post', 'put', 'patch', 'delete'].map((m) => [m, (url) => new TestRequest(m.toUpperCase(), url)]));
export const api = () => client;
const tokens = {};

export async function login(role) {
  if (tokens[role]) return tokens[role];
  const res = await api().post('/api/auth/login').send({ email: `${role}@example.test`, password: TEST_PASSWORD });
  if (res.status !== 200) throw new Error(`login ${role} failed: ${JSON.stringify(res.body)}`);
  tokens[role] = res.body.data.token;
  return tokens[role];
}

export const auth = (token) => ({ Authorization: `Bearer ${token}` });

export async function farmByCode(token, code) {
  const res = await api().get(`/api/farms?search=${code}`).set(auth(token));
  return res.body.data.farms.find((f) => f.farmCode === code);
}
