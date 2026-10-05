import fs from 'node:fs';
import path from 'node:path';
import prisma from './config/prisma.js';
import { env } from './config/env.js';
import { startScheduler as defaultStartScheduler } from './jobs/scheduler.js';

export async function pendingMigrations(prismaClient, dir) {
  const expected = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const applied = new Set((await prismaClient.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL`).map((r) => r.migration_name));
  return expected.filter((m) => !applied.has(m));
}

/** Process startup for the Next server (called once from instrumentation.js). Former src/server.js main(). */
export async function boot({
  startScheduler = defaultStartScheduler,
  prismaClient = prisma,
  logger = console,
  migrationsDir = path.join(process.cwd(), 'prisma', 'migrations'),
  enableJobs = env.enableJobs,
} = {}) {
  if (globalThis.__mwaniBoot) return globalThis.__mwaniBoot;
  const state = { tasks: [], shutdown: null };
  globalThis.__mwaniBoot = state;
  try {
    await prismaClient.$connect();
    logger.log('[db] connected to PostgreSQL');
    // The code expects the latest schema; an unapplied migration shows up as 500s on many pages, so say so loudly.
    const pending = await pendingMigrations(prismaClient, migrationsDir);
    if (pending.length) {
      logger.error(`[db] ${pending.length} database migration(s) not applied: ${pending.join(', ')}\n[db] Run: npx prisma migrate deploy   (pages will fail until you do)`);
    }
  } catch (err) {
    // Keep serving: /api/health reports the outage and requests get a clear 503 instead of a crash.
    logger.error('[db] could not connect to PostgreSQL — check DATABASE_URL and that the server is running:', err.message);
  }
  if (enableJobs) state.tasks = startScheduler();

  let stopping = false;
  state.shutdown = async (signal) => {
    if (stopping) return;
    stopping = true;
    logger.log(`[api] ${signal} received, shutting down`);
    await Promise.allSettled(state.tasks.map((task) => task.destroy()));
    await prismaClient.$disconnect().catch(() => {});
  };
  return state;
}
