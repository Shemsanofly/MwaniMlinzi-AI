import crypto from 'node:crypto';
import prisma from '../config/prisma.js';
import { addDays } from '../utils/dates.js';

/**
 * Signed, revocable tokens that give an outside party (processor, buyer, NGO, programme)
 * read-only access to one cooperative's aggregated numbers over HTTP, without an interactive login.
 *
 * The token is opaque (32 random bytes, base64url) and is checked on every request. We never return
 * farmer-identifying data behind this surface — only cooperative-level aggregates.
 */
export const PublicAccessService = {
  /** Issue a new token. Returns { record, plain } — `plain` is only shown once. */
  async issue({ label, scope, cooperativeId = null, createdById, expiresInDays = 90 }) {
    const plain = crypto.randomBytes(32).toString('base64url');
    const expiresAt = expiresInDays ? addDays(new Date(), expiresInDays) : null;
    const record = await prisma.publicAccessToken.create({
      data: { token: plain, label, scope, cooperativeId, createdById, expiresAt },
      include: { cooperative: { select: { id: true, code: true, name: true } } },
    });
    return { record, plain };
  },

  async list() {
    return prisma.publicAccessToken.findMany({
      orderBy: { createdAt: 'desc' },
      include: { cooperative: { select: { id: true, code: true, name: true } }, createdBy: { select: { fullName: true } } },
    });
  },

  async revoke(id) {
    return prisma.publicAccessToken.update({ where: { id }, data: { revokedAt: new Date() } });
  },

  /** Validate a token for a given scope. Returns the token row + its cooperative (null = all) or throws. */
  async authenticate(rawToken, scope) {
    if (!rawToken || typeof rawToken !== 'string') return null;
    const row = await prisma.publicAccessToken.findUnique({
      where: { token: rawToken },
      include: { cooperative: true },
    });
    if (!row) return null;
    if (row.revokedAt) return null;
    if (row.expiresAt && row.expiresAt < new Date()) return null;
    if (row.scope !== scope) return null;
    // Fire-and-forget usage tracking.
    prisma.publicAccessToken
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date(), requestCount: { increment: 1 } } })
      .catch(() => {});
    return row;
  },
};
