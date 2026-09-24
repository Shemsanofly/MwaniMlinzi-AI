import dotenv from 'dotenv';

dotenv.config({ quiet: true });

/** Tests always run against a separate database (never your dev data). */
export function testDatabaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('Set DATABASE_URL or TEST_DATABASE_URL to run tests');
  const u = new URL(base);
  u.pathname = `${u.pathname.replace(/\/$/, '')}_test`;
  return u.toString();
}
export const TEST_PASSWORD = 'TestDemo123!';
