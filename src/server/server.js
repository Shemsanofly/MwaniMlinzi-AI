import fs from 'node:fs';
import path from 'node:path';
import { env } from './config/env.js';
import prisma from './config/prisma.js';
import { startScheduler } from './jobs/scheduler.js';

/** The code expects the latest schema; an unapplied migration shows up as 500s on many pages, so say so loudly. */
async function warnOnPendingMigrations() {
  const dir = path.join(process.cwd(), 'prisma', 'migrations');
  const expected = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const applied = new Set((await prisma.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL`).map((r) => r.migration_name));
  const pending = expected.filter((m) => !applied.has(m));
  if (pending.length) {
    console.error(`[db] ${pending.length} database migration(s) not applied: ${pending.join(', ')}\n[db] Run: npx prisma migrate deploy   (pages will fail until you do)`);
  }
}

async function main() {
  try {
    await prisma.$connect();
    console.log('[db] connected to PostgreSQL');
    await warnOnPendingMigrations();
  } catch (err) {
    // Keep serving: /api/health reports the outage and requests get a clear 503 instead of a crash.
    console.error('[db] could not connect to PostgreSQL — check DATABASE_URL and that the server is running:', err.message);
  }
  // TEMPORARY (Task 3): the Express listen block was removed; Task 4 replaces this file with the Next bootstrap.
  // Jest never imports this file.
  const tasks = [];
  if (env.enableJobs) tasks.push(...startScheduler());
  let stopping = false;
  const shutdown = async (signal, code = 0) => {
    if (stopping) return;
    stopping = true;
    console.log(`[api] ${signal} received, shutting down`);
    await Promise.allSettled(tasks.map((task) => task.destroy()));
    try {
      await prisma.$disconnect();
    } finally {
      process.exit(code);
    }
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(`[api] Could not start: ${err.message}`);
  process.exit(1);
});
