import { PrismaClient } from '@prisma/client';
import { testDatabaseUrl } from './testDb.js';

/**
 * Drops the test database after the run, so its test-only fixture farms never sit next to the real database
 * (e.g. in pgAdmin). globalSetup recreates it on the next `npm test`. Only ever drops a database named *_test.
 */
export default async function globalTeardown() {
  const url = new URL(testDatabaseUrl());
  const name = decodeURIComponent(url.pathname.slice(1));
  if (!name.endsWith('_test')) return;
  url.pathname = '/postgres';
  const admin = new PrismaClient({ datasourceUrl: url.toString() });
  try {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name.replace(/"/g, '')}" WITH (FORCE)`);
  } finally {
    await admin.$disconnect();
  }
}
