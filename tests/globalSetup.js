import { execSync } from 'node:child_process';
import { testDatabaseUrl, TEST_PASSWORD } from './testDb.js';

/** Creates/migrates the test database and loads the test fixtures once per test run. */
export default async function globalSetup() {
  const url = testDatabaseUrl();
  const env = { ...process.env, DATABASE_URL: url, NODE_ENV: 'test', FIXTURE_PASSWORD: TEST_PASSWORD, WEATHER_PROVIDER: 'none', OCEAN_PROVIDER: 'none', JWT_SECRET: process.env.JWT_SECRET || 'test-secret' };
  execSync('npx prisma migrate deploy', { env, stdio: 'pipe' });
  execSync('node tests/fixtures/seedTestData.js', { env, stdio: 'pipe' });
}
