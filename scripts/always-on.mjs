import { spawn } from 'node:child_process';
import { createConnection, createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const root = fileURLToPath(new URL('../', import.meta.url));
const supervisorPort = Number(process.env.MWANI_SUPERVISOR_PORT || 5172);
const services = [
  { name: 'app', port: Number(process.env.MWANI_PORT || process.env.PORT || 5173), host: 'localhost' },
];
const log = (message) => console.log(`[always-on] ${message}`);

if (process.argv.includes('--stop')) {
  const client = createConnection({ port: supervisorPort, host: '127.0.0.1' });
  client.setTimeout(15000);
  client.on('connect', () => client.write('stop\n'));
  client.on('timeout', () => { console.error('Background runner did not stop in time.'); client.destroy(); process.exitCode = 1; });
  client.on('error', (err) => {
    if (err.code === 'ECONNREFUSED') log('Background runner is already stopped.');
    else { console.error(err.message); process.exitCode = 1; }
  });
  await new Promise((resolve) => client.on('close', resolve));
  process.exit(process.exitCode || 0);
}

// A loopback-only lock prevents logon, manual startup and reinstall from
// launching duplicate supervisors. It is released automatically on a crash.
const lock = createServer();
try {
  await new Promise((resolve, reject) => {
    lock.once('error', reject);
    lock.listen(supervisorPort, '127.0.0.1', resolve);
  });
} catch (err) {
  if (err.code === 'EADDRINUSE') {
    log('A background runner is already active.');
    process.exit(0);
  }
  throw err;
}

async function portIsFree({ port, host }) {
  const probe = createServer();
  return new Promise((resolve, reject) => {
    probe.once('error', (err) => err.code === 'EADDRINUSE' ? resolve(false) : reject(err));
    probe.listen({ port, host }, () => probe.close(() => resolve(true)));
  });
}

let stopping = false;
let checking = false;
let timer;
let building = false;
let buildChild = null;
const connections = new Set();
lock.on('connection', (socket) => {
  connections.add(socket);
  socket.setTimeout(15000, () => socket.destroy());
  socket.once('close', () => connections.delete(socket));
  socket.on('error', () => socket.destroy());
  let message = '';
  socket.on('data', (chunk) => {
    message += chunk.toString();
    if (message.trim() === 'status') {
      socket.end(`${JSON.stringify({ name: 'MwaniMlinzi AI runner', appPort: services[0].port, ...(building ? { building: true } : {}) })}\n`);
    } else if (message.trim() === 'stop') stop();
    else if (message.length > 32) socket.destroy();
  });
});
async function ensureServices() {
  if (stopping || checking) return;
  checking = true;
  try {
    for (const service of services) {
      if (stopping || service.child) continue;
      // Leave separately started servers alone. If their terminal closes,
      // take over the now-free port on the next check.
      if (!(await portIsFree(service))) continue;
      if (stopping) break;
      const child = spawn(process.execPath, ['scripts/dev-service.mjs', service.name], {
        cwd: root,
        env: {
          ...process.env,
          MWANI_ALWAYS_ON: '1',
          MWANI_PORT: String(services[0].port),
        },
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
        windowsHide: true,
      });
      service.child = child;
      log(`Started ${service.name} supervisor (PID ${child.pid}) on port ${service.port}.`);
      child.on('error', (err) => log(`${service.name}: ${err.message}`));
      child.on('exit', () => {
        service.child = null;
        if (!stopping) log(`${service.name} stopped; restarting shortly.`);
      });
    }
  } catch (err) {
    log(`Startup check failed; will retry: ${err.message}`);
  } finally {
    checking = false;
  }
}

async function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  log('Stopping background runner.');
  if (buildChild && buildChild.exitCode === null && buildChild.signalCode === null) {
    const child = buildChild;
    const exited = new Promise((resolve) => child.once('exit', resolve));
    if (process.platform === 'win32') {
      // Stop the whole build tree, not just the node process that started it.
      spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }).on('error', () => child.kill());
    } else {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill(); }
    }
    await exited;
  }
  await Promise.all(services.map(({ child }) => new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once('exit', resolve);
    if (child.connected) child.send('stop', (err) => { if (err) child.kill(); });
    else child.kill();
  })));
  lock.close();
  for (const socket of connections) socket.end();
  if (process.connected) process.disconnect();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('message', (message) => { if (message === 'stop') stop(); });
process.on('disconnect', stop);
// `next start` serves a production build; build once if none exists yet. The
// build runs asynchronously so status, stop and signals keep working meanwhile.
// MWANI_BUILD_CMD (a node script path) is a test-only override.
const buildScript = process.env.MWANI_BUILD_CMD;
if (buildScript || !existsSync(new URL('../.next/BUILD_ID', import.meta.url))) {
  log('No production build found; running next build once.');
  building = true;
  buildChild = spawn(process.execPath, buildScript ? [buildScript] : ['node_modules/next/dist/bin/next', 'build'], {
    cwd: root, stdio: 'inherit', windowsHide: true, detached: process.platform !== 'win32',
  });
  const result = await new Promise((resolve) => {
    buildChild.once('error', () => resolve({ code: 1 }));
    buildChild.once('exit', (code) => resolve({ code }));
  });
  building = false;
  buildChild = null;
  if (!stopping && result.code !== 0) {
    stopping = true;
    console.error('[always-on] next build failed; not starting the app.');
    lock.close();
    for (const socket of connections) socket.end();
    process.exit(1);
  }
}
if (!stopping) {
  log(`Monitoring the app server. Open http://localhost:${services[0].port}/login`);
  timer = setInterval(ensureServices, 2000);
  await ensureServices();
}
