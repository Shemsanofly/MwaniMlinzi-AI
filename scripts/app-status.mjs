import { createConnection, createServer } from 'node:net';

export async function portIsFree({ port, host }) {
  const probe = createServer();
  return new Promise((resolve, reject) => {
    probe.once('error', (err) => err.code === 'EADDRINUSE' ? resolve(false) : reject(err));
    probe.listen({ port, host }, () => probe.close(() => resolve(true)));
  });
}

export async function appStatus(service) {
  let owned = false;
  const controller = new AbortController();
  // Keep the startup deadline referenced until fetch/body reads settle. An
  // unreferenced AbortSignal.timeout can let Node exit with code 13 when a
  // conflicting server immediately closes its connection.
  const deadline = setTimeout(() => controller.abort(), 5000);
  try {
    const origin = service.name === 'backend' ? `http://127.0.0.1:${service.port}` : `http://localhost:${service.port}`;
    const response = await fetch(origin, { signal: controller.signal });
    if (!response.ok) return { owned: false, healthy: false };
    owned = service.name === 'backend'
      ? (await response.json()).data?.name === 'MwaniMlinzi AI API'
      : (await response.text()).includes('<title>MwaniMlinzi AI</title>');
    if (!owned) return { owned: false, healthy: false };
    const health = await fetch(`${origin}/api/health`, { signal: controller.signal });
    return { owned: true, healthy: health.ok && (await health.json()).data?.database === 'ok' };
  } catch {
    // A slow health check does not change the identity we already verified.
    return { owned, healthy: false };
  } finally {
    clearTimeout(deadline);
  }
}

export function backgroundStatus(port = Number(process.env.MWANI_SUPERVISOR_PORT || 5172)) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    let data = '';
    const finish = (status = null) => { socket.destroy(); resolve(status); };
    socket.setTimeout(2000, finish);
    socket.once('error', () => finish());
    socket.once('connect', () => socket.write('status\n'));
    socket.on('data', (chunk) => {
      data += chunk.toString();
      if (!data.includes('\n')) return;
      try {
        const status = JSON.parse(data);
        finish(status.name === 'MwaniMlinzi AI runner' ? status : null);
      } catch { finish(); }
    });
    socket.once('end', () => finish());
  });
}
