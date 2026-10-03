/**
 * Mirrors the backend validator for `risk.thresholds`: three numbers strictly between 0 and 1,
 * strictly ascending MEDIUM < HIGH < CRITICAL. Returns an i18n error key or null.
 */
export function thresholdError(v) {
  const vals = ['MEDIUM', 'HIGH', 'CRITICAL'].map((k) => v?.[k]);
  if (vals.some((x) => typeof x !== 'number' || Number.isNaN(x))) return 'admin.settings.thresholdNumber';
  if (vals.some((x) => x <= 0 || x >= 1)) return 'admin.settings.thresholdRange';
  if (!(vals[0] < vals[1] && vals[1] < vals[2])) return 'admin.settings.thresholdOrder';
  return null;
}
