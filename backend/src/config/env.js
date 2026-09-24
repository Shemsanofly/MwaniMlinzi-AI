import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const bool = (v, def = false) => (v === undefined || v === '' ? def : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));

const nodeEnv = process.env.NODE_ENV || 'development';

if (!process.env.JWT_SECRET && nodeEnv !== 'test') {
  // Fail fast: never run with an implicit/weak signing secret.
  throw new Error('JWT_SECRET is not set. Copy backend/.env.example to backend/.env and set a long random JWT_SECRET.');
}

export const env = {
  nodeEnv,
  isTest: nodeEnv === 'test',
  isProduction: nodeEnv === 'production',
  port: Number(process.env.PORT || 5000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || 'test-only-secret-not-for-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
  demoMode: bool(process.env.DEMO_MODE, true),
  enableJobs: bool(process.env.ENABLE_JOBS, true) && nodeEnv !== 'test',
  llm: {
    provider: (process.env.LLM_PROVIDER || '').toLowerCase(),
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || '',
  },
  weather: { provider: (process.env.WEATHER_PROVIDER || '').toLowerCase(), apiKey: process.env.WEATHER_API_KEY || '' },
  ocean: { provider: (process.env.OCEAN_PROVIDER || '').toLowerCase(), apiKey: process.env.OCEAN_API_KEY || '' },
  // Africa's Talking (SMS + USSD). Credentials only come from the environment — never from the database or the UI.
  africastalking: {
    username: process.env.AT_USERNAME || '',
    apiKey: process.env.AT_API_KEY || '',
    environment: (process.env.AT_ENVIRONMENT || 'sandbox').toLowerCase() === 'production' ? 'production' : 'sandbox',
    senderId: process.env.AT_SMS_SENDER_ID || '',
    ussdServiceCode: process.env.AT_USSD_SERVICE_CODE || '',
    // Shared secret appended to the callback URLs you register in the Africa's Talking dashboard (?secret=...).
    callbackSecret: process.env.AT_CALLBACK_SECRET || '',
  },
  // Public HTTPS base URL of this API (used to show the callback URLs to admins), e.g. https://api.example.org
  publicApiUrl: (process.env.PUBLIC_API_URL || '').replace(/\/$/, ''),
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || 5) * 1024 * 1024,
};
