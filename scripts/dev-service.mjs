import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const name = process.argv[2];
const port = process.env.MWANI_PORT || process.env.PORT || '5173';
const commands = {
  app: [
    'node_modules/next/dist/bin/next',
    ...(process.env.MWANI_ALWAYS_ON === '1' ? ['start'] : ['dev']),
    '--port', port, '--hostname', 'localhost',
  ],
};
if (!Object.hasOwn(commands, name) || !process.connected) {
  console.error('[dev] Service supervisors must be started by scripts/dev.mjs.');
  process.exit(1);
}

const child = spawn(process.execPath, [...commands[name], ...process.argv.slice(3)], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  stdio: 'inherit',
  // A separate group lets POSIX stop the watcher and its server together.
  detached: process.platform !== 'win32',
  windowsHide: true,
});
if (process.env.MWANI_ALWAYS_ON === '1') console.log(`[dev] ${name} process PID ${child.pid}`);

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
    process.exit(code);
  }

  if (process.platform === 'win32') {
    // child.kill() only stops Node's watcher on Windows, orphaning the server.
    // Target only the process tree created by this supervisor.
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore', windowsHide: true,
    });
    killer.on('error', (err) => {
      console.error(`[dev] Could not stop ${name}: ${err.message}`);
      process.exit(1);
    });
    killer.on('exit', (result) => process.exit(result === 0 || child.exitCode !== null || child.signalCode !== null ? code : 1));
  } else {
    const killGroup = (signal) => {
      try { process.kill(-child.pid, signal); } catch (err) {
        if (err.code !== 'ESRCH') throw err;
      }
    };
    killGroup('SIGTERM');
    // A watcher may exit before a slow server has released the port.
    setTimeout(() => {
      killGroup('SIGKILL');
      process.exit(code);
    }, 1000);
  }
}

process.on('message', (message) => { if (message === 'stop') stop(); });
process.on('disconnect', () => stop());
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
child.on('error', (err) => {
  console.error(`[dev] Could not start ${name}: ${err.message}`);
  stop(1);
});
child.on('exit', (code) => {
  if (!stopping) process.exit(code || 1);
});
