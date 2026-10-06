import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createConnection, createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));

async function unusedPort(host) {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, host, resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function waitFor(check, description, logs) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(200);
  }
  assert.fail(`Timed out waiting for ${description}\n${logs()}`);
}

test('background app serves login, avoids duplicates, and restores the stopped app', { timeout: 240000 }, async (t) => {
  const appPort = await unusedPort('localhost');
  const lockPort = await unusedPort('127.0.0.1');
  const environment = {
    ...process.env, MWANI_PORT: String(appPort), MWANI_SUPERVISOR_PORT: String(lockPort),
    ENABLE_JOBS: 'false', NO_COLOR: '1',
  };
  const launch = (args = []) => spawn(process.execPath, ['scripts/always-on.mjs', ...args], {
    cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true,
  });
  const runner = launch();
  const exited = once(runner, 'exit');
  let output = '';
  runner.stdout.on('data', (chunk) => { output += chunk; });
  runner.stderr.on('data', (chunk) => { output += chunk; });
  const logs = () => output;
  t.after(async () => {
    if (runner.exitCode === null && runner.signalCode === null) runner.send('stop');
    await exited;
  });

  async function healthy() {
    assert.equal(runner.exitCode, null, logs());
    try {
      const res = await fetch(`http://localhost:${appPort}/api/health`, { signal: AbortSignal.timeout(2000) });
      return res.ok && (await res.json()).data.database === 'ok';
    } catch { return false; }
  }
  await waitFor(healthy, 'working app and database', logs);
  const login = await fetch(`http://localhost:${appPort}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'connection-check@example.invalid', password: 'test-check-only' }),
  });
  assert.equal(login.status, 401);
  assert.equal((await login.json()).error.code, 'INVALID_CREDENTIALS');

  const status = await new Promise((resolve, reject) => {
    const socket = createConnection({ port: lockPort, host: '127.0.0.1' });
    let data = '';
    socket.on('data', (chunk) => { data += chunk; });
    socket.on('end', () => resolve(JSON.parse(data)));
    socket.on('error', reject);
    socket.on('connect', () => socket.write('status\n'));
  });
  assert.deepEqual(status, { name: 'MwaniMlinzi AI runner', appPort });

  const duplicate = launch();
  let duplicateOutput = '';
  duplicate.stdout.on('data', (chunk) => { duplicateOutput += chunk; });
  assert.equal((await once(duplicate, 'exit'))[0], 0);
  assert.match(duplicateOutput, /already active/);

  // Running dev while the background app is active must succeed without
  // starting another server or stopping the servers when the command exits.
  const dev = spawn(process.execPath, ['scripts/dev.mjs'], {
    cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let devOutput = '';
  dev.stdout.on('data', (chunk) => { devOutput += chunk; });
  dev.stderr.on('data', (chunk) => { devOutput += chunk; });
  assert.equal((await once(dev, 'exit'))[0], 0, devOutput);
  assert.match(devOutput, /SUCCESS:/);
  assert.match(devOutput, /Reusing the running app/);
  assert.equal(await healthy(), true);

  {
    const name = 'app';
    const pids = () => [...output.matchAll(new RegExp(`\\[dev\\] ${name} process PID (\\d+)`, 'g'))].map((match) => Number(match[1]));
    const before = pids();
    assert.ok(before.length, logs());
    process.kill(before.at(-1), 'SIGKILL');
    await waitFor(() => pids().length > before.length, `${name} to restart`, logs);
    await waitFor(healthy, 'app recovery after restart', logs);
  }

  const stop = launch(['--stop']);
  assert.equal((await once(stop, 'exit'))[0], 0);
  assert.equal((await exited)[0], 0, logs());
  for (const port of [appPort, lockPort]) {
    const probe = createServer();
    await new Promise((resolve, reject) => {
      probe.once('error', reject);
      probe.listen(port, port === appPort ? 'localhost' : '127.0.0.1', resolve);
    });
    await new Promise((resolve) => probe.close(resolve));
  }
});

test('the runner stays responsive and stops cleanly during its first build', { timeout: 60000 }, async (t) => {
  const appPort = await unusedPort('localhost');
  const lockPort = await unusedPort('127.0.0.1');
  const dir = mkdtempSync(join(tmpdir(), 'mwani-build-'));
  const marker = join(dir, 'child.pid');
  // A fake slow build: it spawns a grandchild and then sleeps.
  const script = join(dir, 'slow-build.mjs');
  writeFileSync(script, `import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const g = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
writeFileSync(${JSON.stringify(marker)}, String(g.pid));
setInterval(() => {}, 1000);
`);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const environment = {
    ...process.env, MWANI_PORT: String(appPort), MWANI_SUPERVISOR_PORT: String(lockPort),
    MWANI_BUILD_CMD: script, ENABLE_JOBS: 'false', NO_COLOR: '1',
  };
  const launch = (args = []) => spawn(process.execPath, ['scripts/always-on.mjs', ...args], {
    cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true,
  });
  const runner = launch();
  const exited = once(runner, 'exit');
  let output = '';
  runner.stdout.on('data', (chunk) => { output += chunk; });
  runner.stderr.on('data', (chunk) => { output += chunk; });
  t.after(async () => {
    if (runner.exitCode === null && runner.signalCode === null) { runner.kill('SIGKILL'); await exited; }
  });
  await waitFor(() => existsSync(marker), 'the fake build to start', () => output);
  const grandchild = Number(readFileSync(marker, 'utf8'));
  t.after(() => { try { process.kill(grandchild, 'SIGKILL'); } catch { /* already gone */ } });

  // Status still answers while building.
  const status = await new Promise((resolve, reject) => {
    const socket = createConnection({ port: lockPort, host: '127.0.0.1' });
    let data = '';
    socket.on('data', (chunk) => { data += chunk; });
    socket.on('end', () => resolve(JSON.parse(data)));
    socket.on('error', reject);
    socket.on('connect', () => socket.write('status\n'));
  });
  assert.deepEqual(status, { name: 'MwaniMlinzi AI runner', appPort, building: true });

  // dev must refuse clearly instead of starting a second server.
  const dev = spawn(process.execPath, ['scripts/dev.mjs'], { cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let devOutput = '';
  dev.stdout.on('data', (chunk) => { devOutput += chunk; });
  dev.stderr.on('data', (chunk) => { devOutput += chunk; });
  assert.equal((await once(dev, 'exit'))[0], 1, devOutput);
  assert.match(devOutput, /still building/);

  const stop = launch(['--stop']);
  assert.equal((await once(stop, 'exit'))[0], 0);
  assert.equal((await exited)[0], 0, output);
  await waitFor(() => !isAlive(grandchild), 'the build grandchild to exit', () => output);
  for (const [port, host] of [[appPort, 'localhost'], [lockPort, '127.0.0.1']]) {
    const probe = createServer();
    await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(port, host, resolve); });
    await new Promise((resolve) => probe.close(resolve));
  }
});

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
