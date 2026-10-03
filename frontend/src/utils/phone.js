/**
 * Tanzanian mobile numbers — mirrors backend/src/utils/phone.js.
 * Accepts +255…, 255…, 00255…, 07…/06… and 7…/6… with spaces, dashes or brackets.
 * @returns '+255XXXXXXXXX' or null
 */
export function normalizeTzPhone(input) {
  if (input == null) return null;
  let d = String(input).trim().replace(/[\s\-().]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  if (!/^\d+$/.test(d)) return null;
  if (d.startsWith('255')) d = d.slice(3);
  else if (d.startsWith('0')) d = d.slice(1);
  return /^[67]\d{8}$/.test(d) ? `+255${d}` : null;
}

export const isValidTzPhone = (input) => normalizeTzPhone(input) !== null;

/** '+255777123456' → '+255 777 123 456' for display. */
export const formatTzPhone = (p) => (p && /^\+255\d{9}$/.test(p) ? `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7, 10)} ${p.slice(10)}` : p || '');
