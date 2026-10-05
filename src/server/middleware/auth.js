import jwt from 'jsonwebtoken';
import prisma from '../config/prisma.js';
import { env } from '../config/env.js';
import { forbidden, unauthorized } from '../utils/errors.js';

export const ROLES = Object.freeze({
  FARMER: 'FARMER',
  ADMIN: 'ADMIN',
});
export const ACTIVE_ROLE_NAMES = Object.freeze(Object.values(ROLES));
// Only administrators can operate across farms and cooperatives.
export const STAFF_ROLES = Object.freeze([ROLES.ADMIN]);
export const CROSS_COOP_STAFF = STAFF_ROLES;

export const signToken = (user) => jwt.sign({ sub: user.id }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

/** Loads the user fresh from PostgreSQL on every request so role changes / deactivation apply immediately. */
export async function loadUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } }, farmer: true },
  });
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    preferredLanguage: user.preferredLanguage,
    isActive: user.isActive,
    smsEnabled: user.smsEnabled,
    notifyRiskAlerts: user.notifyRiskAlerts,
    notifyHarvest: user.notifyHarvest,
    notifySystem: user.notifySystem,
    cooperativeId: user.cooperativeId,
    farmerId: user.farmer?.id || null,
    roles: user.roles.map((r) => r.role.name).filter((r) => ACTIVE_ROLE_NAMES.includes(r)),
  };
}

export async function authenticate(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw unauthorized();
  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw unauthorized('Invalid or expired token');
  }
  const user = await loadUser(payload.sub);
  if (!user || !user.isActive) throw unauthorized('Account not found or disabled');
  req.user = user;
}

export const hasRole = (user, ...roles) => !!user && user.roles.some((r) => roles.includes(r));

/** authorize('ADMIN') or authorize('FARMER', 'ADMIN') — any matching active role passes. */
export const authorize = (...roles) => (req) => {
  if (!req.user) throw unauthorized();
  if (!hasRole(req.user, ...roles)) throw forbidden();
};
