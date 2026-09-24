import jwt from 'jsonwebtoken';
import prisma from '../config/prisma.js';
import { env } from '../config/env.js';
import { forbidden, unauthorized } from '../utils/errors.js';

export const ROLES = Object.freeze({
  FARMER: 'FARMER',
  COOPERATIVE_ADMIN: 'COOPERATIVE_ADMIN',
  EXTENSION_OFFICER: 'EXTENSION_OFFICER',
  BUYER: 'BUYER',
  ADMIN: 'ADMIN',
});

export const signToken = (user) => jwt.sign({ sub: user.id }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

/** Loads the user fresh from PostgreSQL on every request so role changes / deactivation apply immediately. */
export async function loadUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } }, farmer: true, buyer: true },
  });
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    preferredLanguage: user.preferredLanguage,
    isActive: user.isActive,
    isDemo: user.isDemo,
    smsEnabled: user.smsEnabled,
    notifyRiskAlerts: user.notifyRiskAlerts,
    notifyHarvest: user.notifyHarvest,
    notifySystem: user.notifySystem,
    cooperativeId: user.cooperativeId,
    farmerId: user.farmer?.id || null,
    buyerId: user.buyer?.id || null,
    roles: user.roles.map((r) => r.role.name),
  };
}

export async function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next(unauthorized());
  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    return next(unauthorized('Invalid or expired token'));
  }
  const user = await loadUser(payload.sub);
  if (!user || !user.isActive) return next(unauthorized('Account not found or disabled'));
  req.user = user;
  return next();
}

export const hasRole = (user, ...roles) => !!user && user.roles.some((r) => roles.includes(r));

/** authorize('ADMIN') or authorize('ADMIN', 'EXTENSION_OFFICER') — any matching role passes. */
export const authorize = (...roles) => (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (!hasRole(req.user, ...roles)) return next(forbidden());
  return next();
};
