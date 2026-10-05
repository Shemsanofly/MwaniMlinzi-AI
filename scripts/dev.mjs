import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { appStatus, backgroundStatus, portIsFree } from './app-status.mjs';

const root = new URL('../', import.meta.url);
const backendOnly = process.argv[2] === 'backend';
const frontendArgs = process.argv.slice(2);
const { env } = await import('../backend/src/config/env.js');
const services = [
  { name: 'backend', port: env.port },
  ...(!backendOnly ? [{ name: 'frontend', port: Number(process.env.MWANI_FRONTEND_PORT || 5173), host: 'localhost' }] : []),
];

// Check both installations before starting either service.
for (const { name } of services) {
  if (!existsSync(new URL(`${name}/node_modules/`, root))) {
    console.error(`[dev] Missing ${name} dependencies. Run: npm --prefix ${name} install`);
    process.exit(1);
  }
}
if (!existsSync(new URL('backend/.env', root))) {
  console.error('[dev] Create backend/.env from backend/.env.example and configure DATABASE_URL and JWT_SECRET.');
  process.exit(1);
}

// Reuse this app's healthy servers; an unrelated program on a required port
// remains a real startup error. Check everything before starting any process.
try {
  const background = await backgroundStatus();
  for (const service of services) {
    const monitored = background?.[`${service.name}Port`] === service.port;
    if (monitored) {
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
  const child = spawn(process.execPath, [fileURLToPath(new URL('./dev-service.mjs', import.meta.url)), name, ...(name === 'frontend' ? frontendArgs : [])], {
    cwd: fileURLToPath(root),
    env: { ...process.env, VITE_PROXY_TARGET: process.env.VITE_PROXY_TARGET || `http://127.0.0.1:${env.port}` },
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
      console.error(`[dev] ${name} stopped; shutting down the other service.`);
      stop(code || 1);
    }
  });
}

const deadline = Date.now() + 90000;
while (!stopping) {
  const statuses = await Promise.all(services.map(appStatus));
  if (statuses.every((status) => status.healthy)) {
    console.log(`[dev] SUCCESS: ${services.map(({ name }) => name).join(' and ')} ready; database connected.`);
    if (!backendOnly) console.log(`[dev] Login: http://localhost:${services.find(({ name }) => name === 'frontend').port}/login`);
    else console.log(`[dev] API: http://localhost:${env.port}/api`);
    if (services.every(({ reused }) => reused)) {
      console.log('[dev] Existing servers keep running in the background.');
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
