import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
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

  for (const name of ['app']) {
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
