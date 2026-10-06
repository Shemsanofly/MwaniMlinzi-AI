export const RISK_TYPES = ['HEAT_ICE_ICE', 'STORM_LINE_DAMAGE', 'POOR_GROWTH', 'HARVEST_WINDOW'];
export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const levelRank = (level) => RISK_LEVELS.indexOf(level);

export const DEFAULT_THRESHOLDS = { MEDIUM: 0.3, HIGH: 0.6, CRITICAL: 0.8 };

/** Map probability → level using thresholds stored in system_settings. */
export function levelFor(probability, thresholds = DEFAULT_THRESHOLDS) {
  const t = { ...DEFAULT_THRESHOLDS, ...(thresholds || {}) };
  if (probability >= t.CRITICAL) return 'CRITICAL';
  if (probability >= t.HIGH) return 'HIGH';
  if (probability >= t.MEDIUM) return 'MEDIUM';
  return 'LOW';
}

export const RISK_LABELS = {
  HEAT_ICE_ICE: { en: 'Heat / Ice-Ice', sw: 'Joto / Ice-Ice' },
  STORM_LINE_DAMAGE: { en: 'Storm / Line damage', sw: 'Dhoruba / Kukatika kwa mistari' },
  POOR_GROWTH: { en: 'Poor growth', sw: 'Ukuaji hafifu' },
  HARVEST_WINDOW: { en: 'Harvest window', sw: 'Wakati wa mavuno' },
};

export const LEVEL_LABELS = {
  LOW: { en: 'Low', sw: 'Hatari ndogo' },
  MEDIUM: { en: 'Medium', sw: 'Hatari ya kati' },
  HIGH: { en: 'High', sw: 'Hatari kubwa' },
  CRITICAL: { en: 'Critical', sw: 'Hatari muhimu' },
};

export const EXPOSURE_SCORE = { SHELTERED: 0, MODERATE: 0.5, EXPOSED: 1 };
export const ANCHOR_WEAKNESS = { CONCRETE_BLOCKS: 0.2, ROCKS: 0.5, WOODEN_STAKES: 0.6, SAND_BAGS: 0.8 };

export function cropStageFor(maturityRatio) {
  if (maturityRatio == null) return 'ANY';
  if (maturityRatio < 0.3) return 'EARLY';
  if (maturityRatio < 0.7) return 'GROWING';
  if (maturityRatio < 0.9) return 'MATURING';
  return 'HARVEST_READY';
}
