/**
 * Tanzanian phone numbers are stored in one canonical E.164 form: +255XXXXXXXXX (9 digits after 255).
 * Accepts: +255712345678, 255712345678, 0712345678, 712345678, with spaces/dashes/brackets.
 * Mobile numbers start with 6 or 7 after the country code (e.g. 07xx, 06xx).
 */
export function normalizeTzPhone(input) {
  if (input === null || input === undefined) return null;
  let digits = String(input).trim().replace(/[\s\-().]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.startsWith('255')) digits = digits.slice(3);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  if (!/^[67]\d{8}$/.test(digits)) return null;
  return `+255${digits}`;
}

export const isValidTzPhone = (input) => normalizeTzPhone(input) !== null;

/** Mask for logs: +2557****5678 */
export const maskPhone = (p) => (p ? String(p).replace(/^(\+?\d{4})\d+(\d{4})$/, '$1****$2') : p);
