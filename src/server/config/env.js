import dotenv from 'dotenv';
import path from 'node:path';
import { readEnvFileNodeEnv, resolveNodeEnv, runtimeNodeEnv } from './nodeEnv.js';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });

const bool = (v, def = false) => (v === undefined || v === '' ? def : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));

/**
 * Strip whitespace, control characters and one layer of surrounding quotes from an env value.
 * `.env` files copy-pasted from a dashboard commonly end up with a trailing \r, a stray space or a
 * pair of quotes; Africa's Talking then rejects the request with HTTP 401 even though the visible key
 * looks right. Sanitising here means every consumer sees the clean value.
 */
// eslint-disable-next-line no-control-regex -- Intentionally remove ASCII control characters from credentials.
const cleanSecret = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f\s]+/g, '').replace(/^["']|["']$/g, '');

// Never read process.env.NODE_ENV directly on the server: Next inlines it at build time (see nodeEnv.js).
const nodeEnv = resolveNodeEnv({ runtime: runtimeNodeEnv(), fileValue: readEnvFileNodeEnv() });

if (!process.env.JWT_SECRET && nodeEnv !== 'test') {
  // Fail fast: never run with an implicit/weak signing secret.
  throw new Error('JWT_SECRET is not set. Copy .env.example to .env and set a long random JWT_SECRET.');
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
  enableJobs: bool(process.env.ENABLE_JOBS, true) && nodeEnv !== 'test',
  email: {
    host: (process.env.SMTP_HOST || '').trim(),
    port: Number(process.env.SMTP_PORT || 587),
    secure: bool(process.env.SMTP_SECURE, Number(process.env.SMTP_PORT || 587) === 465),
    requireTLS: bool(process.env.SMTP_REQUIRE_TLS, true),
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: (process.env.SMTP_FROM || '').trim(),
  },
  llm: {
    provider: (process.env.LLM_PROVIDER || '').toLowerCase(),
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || '',
  },
  // Live environmental data. Empty = Open-Meteo / Open-Meteo Marine (free, no key); 'none' disables a provider.
  //   WEATHER_PROVIDER: open-meteo | openweathermap | tma    (TMA reads TMA_BULLETIN_PATH, see weatherProvider.js)
  //   OCEAN_PROVIDER:   open-meteo-marine | cmems | copernicus | copernicus-marine | stormglass
  weather: {
    provider: (process.env.WEATHER_PROVIDER || '').toLowerCase(),
    apiKey: process.env.WEATHER_API_KEY || '',
    tmaBulletinPath: process.env.TMA_BULLETIN_PATH || '',
    tmaMaxAgeHours: Number(process.env.TMA_BULLETIN_MAX_HOURS || 24),
  },
  ocean: { provider: (process.env.OCEAN_PROVIDER || '').toLowerCase(), apiKey: process.env.OCEAN_API_KEY || '' },
  geocoding: {
    url: process.env.GEOCODING_URL === 'none' ? '' : (process.env.GEOCODING_URL || 'https://nominatim.openstreetmap.org'),
    userAgent: process.env.GEOCODING_USER_AGENT || 'MwaniMlinzi-AI/1.0 (farm location lookup)',
  },
  // Optional remote ML service (LightGBM/XGBoost). Empty = use the built-in logistic regression baseline.
  mlService: {
    url: (process.env.ML_SERVICE_URL || '').replace(/\/$/, ''),
    timeoutMs: Number(process.env.ML_SERVICE_TIMEOUT_MS || 2500),
  },
  // Africa's Talking (SMS + USSD). Credentials only come from the environment — never from the database or the UI.
  // Every string field is sanitised: hidden \r, trailing spaces or accidental quotes in .env are a common
  // cause of a valid-looking key being rejected by AT with HTTP 401.
  africastalking: {
    username: cleanSecret(process.env.AT_USERNAME),
    apiKey: cleanSecret(process.env.AT_API_KEY),
    environment: (process.env.AT_ENVIRONMENT || 'sandbox').toLowerCase() === 'production' ? 'production' : 'sandbox',
    senderId: cleanSecret(process.env.AT_SMS_SENDER_ID),
    ussdServiceCode: cleanSecret(process.env.AT_USSD_SERVICE_CODE),
    // Shared secret appended to the callback URLs you register in the Africa's Talking dashboard (?secret=...).
    callbackSecret: cleanSecret(process.env.AT_CALLBACK_SECRET),
    // Local/sandbox USSD simulator compatibility. Never enabled in production.
    allowUnsignedSandboxUssd: bool(process.env.AT_ALLOW_UNSIGNED_SANDBOX_USSD, false),
    // Sandbox development only. When true, outbound SMS is short-circuited: no HTTP call is made to
    // Africa's Talking, and every send is logged as QUEUED with a synthetic providerRef. This is for
    // developing USSD→SMS flows when AT auth is not yet set up, or for demo screenshots; the SMS still
    // appears in notification_logs and the Admin → Africa's Talking panel. Silently ignored in production.
    smsDevCapture: bool(process.env.AT_SMS_DEV_CAPTURE, false),
  },
  // Sarufi (WhatsApp gateway). The bot lives on SARUFI_BOT_PHONE; Sarufi forwards every WhatsApp message to
  // /api/integrations/sarufi/webhook?secret=… and sends our reply back to WhatsApp. See docs/SARUFI-WHATSAPP.md.
  sarufi: {
    webhookSecret: cleanSecret(process.env.SARUFI_WEBHOOK_SECRET),
    botPhone: cleanSecret(process.env.SARUFI_BOT_PHONE),
  },
  // Voice-call AI assistant. See docs/superpowers/specs/2026-10-03-voice-call-assistant-design.md.
  voice: {
    stt: {
      provider: (process.env.VOICE_STT_PROVIDER || 'openai').toLowerCase(),
      langHint: (process.env.VOICE_STT_LANG_HINT || 'sw').toLowerCase(),
      maxSeconds: Number(process.env.VOICE_STT_MAX_SECONDS || 30),
      openaiApiKey: cleanSecret(process.env.VOICE_OPENAI_API_KEY) || cleanSecret(process.env.LLM_API_KEY),
      googleApiKey: cleanSecret(process.env.GOOGLE_STT_API_KEY),
    },
    tts: {
      provider: (process.env.VOICE_TTS_PROVIDER || 'google').toLowerCase(),
      voiceSw: process.env.VOICE_TTS_VOICE_SW || 'sw-KE-Standard-A',
      voiceEn: process.env.VOICE_TTS_VOICE_EN || 'en-US-Neural2-C',
      googleApiKey: cleanSecret(process.env.GOOGLE_TTS_API_KEY),
      googleCredentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
      elevenLabsApiKey: cleanSecret(process.env.ELEVENLABS_API_KEY),
      elevenLabsVoiceId: cleanSecret(process.env.ELEVENLABS_VOICE_ID),
    },
    audio: {
      dir: process.env.VOICE_AUDIO_DIR || 'uploads/voice',
      retentionDays: Number(process.env.VOICE_AUDIO_RETENTION_DAYS || 7),
      urlExpiryMinutes: Number(process.env.VOICE_AUDIO_URL_EXPIRY_MINUTES || 10),
    },
    maxTurnsPerCall: Number(process.env.VOICE_MAX_TURNS || 10),
    maxCallDurationSeconds: Number(process.env.VOICE_MAX_CALL_SECONDS || 600),
    pipelineBudgetMs: Number(process.env.VOICE_PIPELINE_BUDGET_MS || 15000),
  },
  // Public HTTPS base URL of this API (used to show the callback URLs to admins), e.g. https://api.example.org
  publicApiUrl: (process.env.PUBLIC_API_URL || '').replace(/\/$/, ''),
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || 5) * 1024 * 1024,
};
