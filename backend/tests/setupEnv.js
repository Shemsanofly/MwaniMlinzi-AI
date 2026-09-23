import { testDatabaseUrl, TEST_PASSWORD } from './testDb.js';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testDatabaseUrl();
process.env.DEMO_MODE = 'true';
process.env.ENABLE_JOBS = 'false';
process.env.LLM_API_KEY = '';
process.env.DEMO_PASSWORD = TEST_PASSWORD;
process.env.JWT_SECRET ||= 'test-secret';
