import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const services = [
  { name: 'backend', args: ['--watch', 'src/server.js'] },
  { name: 'frontend', args: ['node_modules/vite/bin/vite.js'] },
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

const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

for (const { name, args } of services) {
  const child = spawn(process.execPath, args, {
    cwd: fileURLToPath(new URL(`${name}/`, root)),
    stdio: 'inherit',
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
