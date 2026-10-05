import { openApiSpec } from '../../../src/server/config/openapi.js';
import { applySecurityHeaders } from '../../../src/server/http/headers.js';

export const runtime = 'nodejs';
export const GET = () => { const r = Response.json(openApiSpec); applySecurityHeaders(r.headers); return r; };
