import prisma from '../config/prisma.js';
import { ROLES, hasRole } from '../middleware/auth.js';
import { forbidden, notFound } from '../utils/errors.js';

/**
 * Prisma `where` fragment restricting farms to what the user may see.
 *  - ADMIN / EXTENSION_OFFICER: all farms
 *  - COOPERATIVE_ADMIN: farms of their cooperative only
 *  - FARMER: their own farms only
 *  - BUYER: no farm-level access (aggregated supply only)
 */
export function farmScope(user) {
  if (hasRole(user, ROLES.ADMIN, ROLES.EXTENSION_OFFICER)) return {};
  const or = [];
  if (hasRole(user, ROLES.COOPERATIVE_ADMIN) && user.cooperativeId) or.push({ cooperativeId: user.cooperativeId });
  if (hasRole(user, ROLES.FARMER) && user.farmerId) or.push({ farmerId: user.farmerId });
  if (!or.length) return { id: '00000000-0000-0000-0000-000000000000' }; // matches nothing
  return or.length === 1 ? or[0] : { OR: or };
}

export const canViewAllFarms = (user) => hasRole(user, ROLES.ADMIN, ROLES.EXTENSION_OFFICER);

/** Throws 404 if the farm does not exist, 403 if the user may not access it. */
export async function assertFarmAccess(user, farmId, { write = false } = {}) {
  const farm = await prisma.farm.findUnique({ where: { id: farmId }, select: { id: true, farmerId: true, cooperativeId: true } });
  if (!farm) throw notFound('Farm');
  const scope = farmScope(user);
  const allowed = await prisma.farm.count({ where: { AND: [{ id: farmId }, scope] } });
  if (!allowed) throw forbidden('You do not have access to this farm');
  // Farm records (observations, harvests, actions) are written by the owning farmer, extension officers or admins.
  if (write && !hasRole(user, ROLES.ADMIN, ROLES.EXTENSION_OFFICER) && farm.farmerId !== user.farmerId) {
    throw forbidden('Only the farm owner can record data for this farm');
  }
  return farm;
}

export const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
