import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { appStatus, backgroundStatus, portIsFree } from './app-status.mjs';

const root = new URL('../', import.meta.url);
const port = Number(process.env.MWANI_PORT || process.env.PORT || 5173);
const services = [{ name: 'app', port, host: 'localhost' }];

if (!existsSync(new URL('node_modules/', root))) {
  console.error('[dev] Missing dependencies. Run: npm install');
  process.exit(1);
}
if (!existsSync(new URL('.env', root))) {
  console.error('[dev] Create .env from .env.example and configure DATABASE_URL and JWT_SECRET.');
  process.exit(1);
}

// Reuse this app's healthy servers; an unrelated program on a required port
// remains a real startup error. Check everything before starting any process.
try {
  const background = await backgroundStatus();
  for (const service of services) {
    const monitored = background?.appPort === service.port;
    if (monitored) {
      if (background.building) throw new Error('The background runner is still building the app. Try again when it finishes, or run npm run stop:local.');
      service.reused = true;
      continue;
    }
    if (await portIsFree(service)) continue;
    let status;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      status = await appStatus(service);
      if (status.owned) break;
      if (attempt < 2) await delay(500);
    }
    if (!status.owned) throw new Error(`The ${service.name} port ${service.port} is already in use by another program.`);
    service.reused = true;
  }
} catch (err) {
  console.error(`[dev] Could not start: ${err.message}`);
  process.exit(1);
}

const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  if (process.connected) process.disconnect();
  for (const child of children) {
    if (child.connected) child.send('stop', (err) => {
      if (err && child.exitCode === null) child.kill('SIGTERM');
    });
  }
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
process.on('message', (message) => { if (message === 'stop') stop(); });
process.on('disconnect', () => stop());

for (const { name, reused } of services) {
  if (reused) {
    console.log(`[dev] Reusing the running ${name}.`);
    continue;
  }
  // Each supervisor owns a process tree and watches this IPC connection. Even if the
  // terminal/launcher is killed without a signal, disconnect tears down its service.
  const child = spawn(process.execPath, [fileURLToPath(new URL('./dev-service.mjs', import.meta.url)), 'app', ...process.argv.slice(2)], {
    cwd: fileURLToPath(root),
    env: { ...process.env, MWANI_PORT: String(port) },
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    windowsHide: true,
  });
  children.push(child);
  child.on('error', (err) => {
    console.error(`[dev] Could not start ${name}: ${err.message}`);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`[dev] ${name} stopped.`);
      stop(code || 1);
    }
  });
}

const deadline = Date.now() + 90000;
while (!stopping) {
  const statuses = await Promise.all(services.map(appStatus));
  if (statuses.every((status) => status.healthy)) {
    console.log('[dev] SUCCESS: app ready; database connected.');
    console.log(`[dev] Login: http://localhost:${port}/login`);
    if (services.every(({ reused }) => reused)) {
      console.log('[dev] The existing app keeps running in the background.');
      if (process.connected) process.disconnect();
    }
    break;
  }
  if (Date.now() >= deadline) {
    console.error('[dev] Startup did not become healthy. Check PostgreSQL and .local/server-error.log.');
    stop(1);
    break;
  }
  await delay(500);
}
