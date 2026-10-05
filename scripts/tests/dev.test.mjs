import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const backendPort = 15000 + Math.floor(Math.random() * 10000);
const frontendProbe = createServer();
await new Promise((resolve) => frontendProbe.listen(0, 'localhost', resolve));
const frontendPort = frontendProbe.address().port;
await new Promise((resolve) => frontendProbe.close(resolve));
const ports = [backendPort, frontendPort];

async function portIsFree(port) {
  const probe = createServer();
  return new Promise((resolve, reject) => {
    probe.on('error', (err) => err.code === 'EADDRINUSE' ? resolve(false) : reject(err));
    probe.listen({ port, ...(port === frontendPort ? { host: 'localhost' } : {}) }, () => probe.close(() => resolve(true)));
  });
}

async function waitFor(check, description, logs = () => '') {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(100);
  }
  assert.fail(`Timed out waiting for ${description}\n${logs()}`);
}

function launch(args = []) {
  const child = spawn(process.execPath, ['scripts/dev.mjs', ...args], {
    cwd: root,
    env: { ...process.env, PORT: String(backendPort), MWANI_FRONTEND_PORT: String(frontendPort), ENABLE_JOBS: 'false', NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  return { child, logs: () => output, exited: once(child, 'exit') };
}

async function ready(run) {
  await waitFor(() => {
    assert.equal(run.child.exitCode, null, run.logs());
    return run.logs().includes('[dev] SUCCESS:');
  }, 'both services to start', run.logs);
  const response = await fetch(`http://127.0.0.1:${backendPort}/api/health`);
  assert.equal(response.status, 200, run.logs());
  assert.equal((await response.json()).data.database, 'ok');
  assert.equal((await fetch(`http://localhost:${frontendPort}/api/health`)).status, 200);
}

async function released() {
  await waitFor(async () => (await Promise.all(ports.map(portIsFree))).every(Boolean), 'both ports to be released');
}

test('normal stop, repeated startup, abrupt terminal close and restart release every owned service', { timeout: 240000 }, async (t) => {
  assert.equal(await portIsFree(frontendPort), true);
  assert.equal(await portIsFree(backendPort), true);
  const runs = [];
  t.after(async () => {
    for (const run of runs) {
      if (run.child.exitCode === null && run.child.signalCode === null) {
        run.child.kill('SIGKILL');
        await run.exited;
      }
    }
    await released();
  });

  for (const abrupt of [false, true, false]) {
    const run = launch();
    runs.push(run);
    await ready(run);
    for (const args of [[], ['backend']]) {
      const duplicate = launch(args);
      runs.push(duplicate);
      assert.equal((await duplicate.exited)[0], 0, duplicate.logs());
      assert.match(duplicate.logs(), /SUCCESS:/);
      assert.match(duplicate.logs(), /Reusing the running backend/);
      assert.doesNotMatch(duplicate.logs(), /\[api\] MwaniMlinzi AI API on/);
      assert.equal((await fetch(`http://localhost:${frontendPort}/api/health`)).status, 200);
    }
    if (abrupt) run.child.kill('SIGKILL');
    else run.child.send('stop');
    const [code] = await run.exited;
    if (!abrupt) assert.equal(code, 0, run.logs());
    await released();
  }
});

test('an occupied API port fails before starting the frontend', { timeout: 30000 }, async (t) => {
  const occupied = createServer();
  occupied.on('connection', (socket) => socket.destroy());
  await new Promise((resolve) => occupied.listen(backendPort, resolve));
  t.after(() => new Promise((resolve) => occupied.close(resolve)));
  const run = launch();
  t.after(() => { if (run.child.exitCode === null) run.child.kill('SIGKILL'); });
  const [code] = await run.exited;
  assert.equal(code, 1, run.logs());
  assert.match(run.logs(), /backend port \d+ is already in use by another program/);
  assert.doesNotMatch(run.logs(), /Local:|API on/);
});

test('an occupied frontend port fails and releases the backend', { timeout: 30000 }, async (t) => {
  const occupied = createServer();
  occupied.on('connection', (socket) => socket.destroy());
  await new Promise((resolve) => occupied.listen(frontendPort, 'localhost', resolve));
  t.after(() => new Promise((resolve) => occupied.close(resolve)));
  const run = launch();
  t.after(() => { if (run.child.exitCode === null) run.child.kill('SIGKILL'); });
  const [code] = await run.exited;
  assert.equal(code, 1, run.logs());
  assert.match(run.logs(), /frontend port \d+ is already in use by another program/);
  assert.doesNotMatch(run.logs(), /Local:/);
  await waitFor(() => portIsFree(backendPort), 'backend cleanup', run.logs);
});

test('a standalone API listen failure exits without reporting success or starting jobs', { timeout: 30000 }, async (t) => {
  const occupied = createServer();
  await new Promise((resolve) => occupied.listen(backendPort, resolve));
  t.after(() => new Promise((resolve) => occupied.close(resolve)));
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: fileURLToPath(new URL('../../backend/', import.meta.url)),
    env: { ...process.env, PORT: String(backendPort), ENABLE_JOBS: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const [code] = await once(child, 'exit');
  assert.equal(code, 1, output);
  assert.match(output, /Port \d+ is already in use/);
  assert.doesNotMatch(output, /API on|\[jobs\] scheduled/);
});
