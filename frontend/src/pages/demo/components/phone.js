/** Default phone for the channel simulators: the user's own number, else the demo farmer for staff. */
export const DEMO_FARMER_PHONE = '+255777000001';
export const defaultPhone = (user) => user?.phone || DEMO_FARMER_PHONE;
export const isFarmerOnly = (user) => !!user && !user.roles?.some((r) => ['ADMIN', 'EXTENSION_OFFICER', 'COOPERATIVE_ADMIN'].includes(r));
export const PHONE_RE = /^\+?[0-9]{9,15}$/;

/** Strip the Africa's Talking CON/END prefix from a USSD response. */
export function parseUssd(response = '') {
  const m = /^(CON|END)\s?([\s\S]*)$/.exec(response);
  return m ? { kind: m[1], text: m[2] } : { kind: 'END', text: response };
}

/** Random, non-guessable session id for one USSD dial. */
export const newSessionId = () => `sim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
