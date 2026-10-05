import prisma from '../config/prisma.js';

/** Defaults are written to `system_settings` by the seed and used if a key is missing. */
export const DEFAULT_SETTINGS = {
  'risk.thresholds': {
    value: { MEDIUM: 0.3, HIGH: 0.6, CRITICAL: 0.8 },
    description: 'Probability lower bounds for risk levels (LOW is below MEDIUM).',
  },
  'ai.mode': {
    value: 'HYBRID',
    description: 'RULE_ONLY = rule engine only. HYBRID = blend rule engine with an ACTIVE ML model when one exists.',
  },
  'ai.mlBlendWeight': { value: 0.4, description: 'Weight (0-1) given to the ML probability in HYBRID mode.' },
  'ai.minTrainingRecords': { value: 300, description: 'Minimum labelled records required before a model may be trained.' },
  'actions.requireValidated': {
    value: false,
    description: 'If true, only action-library entries validated by an admin (checked with local seaweed extension experts) can be recommended.',
  },
  'alerts.missingReportDays': { value: 14, description: 'Raise a MISSING_REPORT alert when an active farm has no observation for this many days.' },
  'alerts.dedupHours': { value: 24, description: 'Do not repeat the same alert type for a farm within this many hours.' },
  'environment.maxCacheAgeHours': { value: 48, description: 'Cached LIVE environmental data older than this is not reused.' },
  'drying.thresholds': {
    value: { cautionProbability: 30, badProbability: 60, cautionRainMm: 1, badRainMm: 5 },
    description: 'Drying-weather verdict during 07:00–18:00: BAD above badProbability % or badRainMm; CAUTION from cautionProbability % or cautionRainMm. Starter values awaiting local validation.',
  },
  'notifications.smsEnabled': { value: true, description: "Master switch for SMS notifications (sent through Africa's Talking when AT_USERNAME and AT_API_KEY are set; otherwise logged as NOT_CONFIGURED)." },
};

// Process-wide (globalThis): admin route handlers clear it, and the cron jobs started from
// instrumentation-node.js run in a separate module graph that must see the same invalidation.
const store = (globalThis.__mwaniSettingsCache ??= { cache: null, cacheAt: 0 });
const TTL_MS = 5000;

export async function getAllSettings() {
  if (store.cache && Date.now() - store.cacheAt < TTL_MS) return store.cache;
  const rows = await prisma.systemSetting.findMany();
  const merged = Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([k, v]) => [k, v.value]));
  for (const r of rows) merged[r.key] = r.value;
  store.cache = merged;
  store.cacheAt = Date.now();
  return merged;
}

export async function getSetting(key) {
  const all = await getAllSettings();
  return all[key] ?? DEFAULT_SETTINGS[key]?.value;
}

export async function setSetting(key, value, userId) {
  const row = await prisma.systemSetting.upsert({
    where: { key },
    update: { value, updatedById: userId || null },
    create: { key, value, description: DEFAULT_SETTINGS[key]?.description || null, updatedById: userId || null },
  });
  store.cache = null;
  return row;
}

export function clearSettingsCache() {
  store.cache = null;
}

export async function ensureDefaultSettings() {
  for (const [key, { value, description }] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.systemSetting.upsert({ where: { key }, update: {}, create: { key, value, description } });
  }
  store.cache = null;
}
