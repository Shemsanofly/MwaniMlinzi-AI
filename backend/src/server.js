import { env } from './config/env.js';
import prisma from './config/prisma.js';
import { createApp } from './app.js';
import { startScheduler } from './jobs/scheduler.js';

async function main() {
  try {
    await prisma.$connect();
    console.log('[db] connected to PostgreSQL');
  } catch (err) {
    // Keep serving: /api/health reports the outage and requests get a clear 503 instead of a crash.
    console.error('[db] could not connect to PostgreSQL — check DATABASE_URL and that the server is running:', err.message);
  }
  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`[api] MwaniMlinzi AI API on http://localhost:${env.port}  (docs: /api/docs, demo mode: ${env.demoMode})`);
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
