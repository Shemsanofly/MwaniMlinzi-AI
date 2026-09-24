/**
 * Non-destructive reference-data seed for real deployments:
 *   npm run seed:reference
 * Upserts roles, permissions, seaweed species, default system settings and the Action Library.
 * Existing Action Library entries are left untouched (so expert edits/validations are preserved).
 * Optionally creates the first admin: ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run seed:reference
 */
import bcrypt from 'bcryptjs';
import prisma from '../src/config/prisma.js';
import { ensureDefaultSettings } from '../src/services/settingsService.js';
import { ACTION_LIBRARY } from './data/actionLibrary.js';
import { PERMISSIONS, ROLES, SPECIES } from './data/reference.js';

async function main() {
  const roles = {};
  for (const r of ROLES) roles[r.name] = await prisma.role.upsert({ where: { name: r.name }, update: { description: r.description }, create: r });
  for (const [key, roleNames] of Object.entries(PERMISSIONS)) {
    const perm = await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
    for (const name of roleNames) {
      await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: roles[name].id, permissionId: perm.id } }, update: {}, create: { roleId: roles[name].id, permissionId: perm.id } });
    }
  }
  for (const s of SPECIES) await prisma.seaweedSpecies.upsert({ where: { code: s.code }, update: {}, create: s });
  await ensureDefaultSettings();
  let added = 0;
  for (const a of ACTION_LIBRARY) {
    const exists = await prisma.actionLibrary.findUnique({ where: { code: a.code } });
    if (!exists) { await prisma.actionLibrary.create({ data: a }); added += 1; }
  }
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    if (ADMIN_PASSWORD.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters');
    const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL.toLowerCase() } });
    if (!existing) {
      await prisma.user.create({
        data: {
          email: ADMIN_EMAIL.toLowerCase(), fullName: 'System Administrator', passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
          preferredLanguage: 'en', consentGiven: true, consentAt: new Date(), roles: { create: { roleId: roles.ADMIN.id } },
        },
      });
      console.log(`[seed:reference] created admin ${ADMIN_EMAIL}`);
    }
  }
  console.log(`[seed:reference] roles, permissions, species and settings ensured; ${added} new action-library entries added.`);
}

main().catch((err) => { console.error(err); process.exitCode = 1; }).finally(() => prisma.$disconnect());
