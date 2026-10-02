import { events } from '../db/records.js';
import prisma from '../config/prisma.js';

/** Best-effort audit log; never breaks the main request. */
export async function audit(req, action, entityType, entityId = null, details = null) {
  try {
    await events(prisma, 'AUDIT').create({
      data: {
        userId: req?.user?.id || null,
        action,
        entityType,
        entityId: entityId ? String(entityId) : null,
        details: details ?? undefined,
        ipAddress: req?.ip || null,
      },
    });
  } catch (err) {
    console.warn('[audit] failed to write audit log:', err.message);
  }
}
