import { applySecurityHeaders } from '../../../src/server/http/headers.js';

export const runtime = 'nodejs';

const HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>MwaniMlinzi AI API</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/api/docs/swagger-ui.css"></head>
<body><div id="swagger-ui"></div><script src="/api/docs/swagger-ui-bundle.js"></script>
<script src="/api/docs/swagger-ui-standalone-preset.js"></script><script src="/api/docs/swagger-initializer.js"></script></body></html>`;

export const GET = () => {
  const r = new Response(HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  applySecurityHeaders(r.headers);
  return r;
};
