import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import prisma from './config/prisma.js';
import { createApp } from './app.js';
import { startScheduler } from './jobs/scheduler.js';

/** The code expects the latest schema; an unapplied migration shows up as 500s on many pages, so say so loudly. */
async function warnOnPendingMigrations() {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'prisma', 'migrations');
  const expected = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const applied = new Set((await prisma.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL`).map((r) => r.migration_name));
  const pending = expected.filter((m) => !applied.has(m));
  if (pending.length) {
    console.error(`[db] ${pending.length} database migration(s) not applied: ${pending.join(', ')}\n[db] Run: cd backend && npx prisma migrate deploy   (pages will fail until you do)`);
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
  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`[api] MwaniMlinzi AI API on http://localhost:${env.port}  (docs: /api/docs)`);
  });
  if (env.enableJobs) startScheduler();

  const shutdown = async (signal) => {
    console.log(`[api] ${signal} received, shutting down`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
