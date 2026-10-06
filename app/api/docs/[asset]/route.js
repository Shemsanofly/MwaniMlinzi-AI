import fs from 'node:fs/promises';
import path from 'node:path';
import { applySecurityHeaders } from '../../../../src/server/http/headers.js';

export const runtime = 'nodejs';

const DIST = path.join(process.cwd(), 'node_modules', 'swagger-ui-dist');
const ASSETS = { 'swagger-ui.css': 'text/css', 'swagger-ui-bundle.js': 'text/javascript', 'swagger-ui-standalone-preset.js': 'text/javascript' };
const INIT = `window.onload = () => { window.ui = SwaggerUIBundle({ url: '/api/docs.json', dom_id: '#swagger-ui', presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset], layout: 'StandaloneLayout' }); };`;

export async function GET(_request, { params }) {
  const { asset } = await params;
  let body; let type;
  if (asset === 'swagger-initializer.js') { body = INIT; type = 'text/javascript'; }
  else if (ASSETS[asset]) { body = await fs.readFile(path.join(DIST, asset)); type = ASSETS[asset]; }
  else return Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
  const r = new Response(body, { headers: { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'public, max-age=86400' } });
  applySecurityHeaders(r.headers);
  return r;
}
