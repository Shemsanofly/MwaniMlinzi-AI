import prisma from '../config/prisma.js';
import { ROLES, hasRole, CROSS_COOP_STAFF } from '../middleware/auth.js';
import { forbidden, notFound } from '../utils/errors.js';

/**
 * Prisma `where` fragment restricting farms to what the user may see.
 *  - ADMIN: all farms
 *  - FARMER: their own farms only
 */
export function farmScope(user) {
  if (hasRole(user, ...CROSS_COOP_STAFF)) return {};
  const or = [];
  if (hasRole(user, ROLES.FARMER) && user.farmerId) or.push({ farmerId: user.farmerId });
  if (!or.length) return { id: '00000000-0000-0000-0000-000000000000' }; // matches nothing
  return or.length === 1 ? or[0] : { OR: or };
}

export const canViewAllFarms = (user) => hasRole(user, ...CROSS_COOP_STAFF);

/** Throws 404 if the farm does not exist, 403 if the user may not access it. */
export async function assertFarmAccess(user, farmId, { write = false } = {}) {
  const farm = await prisma.farm.findUnique({ where: { id: farmId }, select: { id: true, farmerId: true, cooperativeId: true } });
  if (!farm) throw notFound('Farm');
  const scope = farmScope(user);
  const allowed = await prisma.farm.count({ where: { AND: [{ id: farmId }, scope] } });
  if (!allowed) throw forbidden('You do not have access to this farm');
  // Farm records (observations, harvests, actions) are written by the owning farmer or admins.
  if (write && !hasRole(user, ROLES.ADMIN) && farm.farmerId !== user.farmerId) {
    throw forbidden('Only the farm owner can record data for this farm');
  }
  return farm;
}

export const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
