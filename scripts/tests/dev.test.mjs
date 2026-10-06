import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const appProbe = createServer();
await new Promise((resolve) => appProbe.listen(0, 'localhost', resolve));
const appPort = appProbe.address().port;
await new Promise((resolve) => appProbe.close(resolve));

async function portIsFree(port) {
  const probe = createServer();
  return new Promise((resolve, reject) => {
    probe.on('error', (err) => err.code === 'EADDRINUSE' ? resolve(false) : reject(err));
    probe.listen({ port, host: 'localhost' }, () => probe.close(() => resolve(true)));
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
    env: { ...process.env, MWANI_PORT: String(appPort), ENABLE_JOBS: 'false', NO_COLOR: '1' },
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
  }, 'the app to start', run.logs);
  const response = await fetch(`http://localhost:${appPort}/api/health`);
  assert.equal(response.status, 200, run.logs());
  assert.equal((await response.json()).data.database, 'ok');
  const login = await fetch(`http://localhost:${appPort}/login`);
  assert.equal(login.status, 200, run.logs());
  assert.match(await login.text(), /<title>MwaniMlinzi AI<\/title>/);
}

async function released() {
  await waitFor(() => portIsFree(appPort), 'the app port to be released');
}

test('normal stop, repeated startup, abrupt terminal close and restart release the owned app', { timeout: 240000 }, async (t) => {
  assert.equal(await portIsFree(appPort), true);
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
    const duplicate = launch();
    runs.push(duplicate);
    assert.equal((await duplicate.exited)[0], 0, duplicate.logs());
    assert.match(duplicate.logs(), /SUCCESS:/);
    assert.match(duplicate.logs(), /Reusing the running app/);
    assert.equal((await fetch(`http://localhost:${appPort}/api/health`)).status, 200);
    if (abrupt) run.child.kill('SIGKILL');
    else run.child.send('stop');
    const [code] = await run.exited;
    if (!abrupt) assert.equal(code, 0, run.logs());
    await released();
  }
});

test('an occupied app port fails without starting a server', { timeout: 30000 }, async (t) => {
  const occupied = createServer();
  occupied.on('connection', (socket) => socket.destroy());
  await new Promise((resolve) => occupied.listen(appPort, 'localhost', resolve));
  t.after(() => new Promise((resolve) => occupied.close(resolve)));
  const run = launch();
  t.after(() => { if (run.child.exitCode === null) run.child.kill('SIGKILL'); });
  const [code] = await run.exited;
  assert.equal(code, 1, run.logs());
  assert.match(run.logs(), /app port \d+ is already in use by another program/);
  assert.doesNotMatch(run.logs(), /SUCCESS|Local:/);
});
