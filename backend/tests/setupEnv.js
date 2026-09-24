import { testDatabaseUrl, TEST_PASSWORD } from './testDb.js';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testDatabaseUrl();
process.env.DEMO_MODE = 'true';
process.env.ENABLE_JOBS = 'false';
process.env.LLM_API_KEY = '';
process.env.DEMO_PASSWORD = TEST_PASSWORD;
process.env.JWT_SECRET ||= 'test-secret';
// Africa's Talking: never call the real API from tests (a fake client is injected where needed).
process.env.AT_USERNAME = '';
process.env.AT_API_KEY = '';
process.env.AT_ENVIRONMENT = 'sandbox';
process.env.AT_USSD_SERVICE_CODE = '*384*1234#';
process.env.AT_CALLBACK_SECRET = 'test-callback-secret';
