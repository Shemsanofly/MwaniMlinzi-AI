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
    description: 'If true, only action-library entries validated by an extension officer can be recommended.',
  },
  'alerts.missingReportDays': { value: 14, description: 'Raise a MISSING_REPORT alert when an active farm has no observation for this many days.' },
  'alerts.dedupHours': { value: 24, description: 'Do not repeat the same alert type for a farm within this many hours.' },
  'environment.maxCacheAgeHours': { value: 48, description: 'Cached LIVE environmental data older than this is not reused.' },
  'environment.preferLive': { value: true, description: 'Use live providers when DEMO_MODE=false and providers are configured.' },
  'notifications.smsEnabled': { value: true, description: "Master switch for SMS notifications (sent through Africa's Talking when AT_USERNAME and AT_API_KEY are set; otherwise logged as NOT_CONFIGURED)." },
};

let cache = null;
let cacheAt = 0;
const TTL_MS = 5000;

export async function getAllSettings() {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;
  const rows = await prisma.systemSetting.findMany();
  const merged = Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([k, v]) => [k, v.value]));
  for (const r of rows) merged[r.key] = r.value;
  cache = merged;
  cacheAt = Date.now();
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
  cache = null;
  return row;
}

export function clearSettingsCache() {
  cache = null;
}

export async function ensureDefaultSettings() {
  for (const [key, { value, description }] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.systemSetting.upsert({ where: { key }, update: {}, create: { key, value, description } });
  }
  cache = null;
}
