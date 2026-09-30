/**
 * MwaniMlinzi AI — reference-data seed (safe to run any time; never deletes anything).
 *
 *   npm run seed
 *
 * Upserts roles, permissions, seaweed species, default system settings and the Action Library
 * (existing Action Library entries are left untouched so expert edits and validations are kept).
 * Creates the first admin account if no admin exists yet:
 *   ADMIN_EMAIL (default admin@mwanimlinzi.local) and ADMIN_PASSWORD (min. 12 characters).
 *   Without ADMIN_PASSWORD a strong password is generated, printed once and saved to
 *   backend/ADMIN_CREDENTIALS.local.txt (git-ignored) — change it after the first login.
 *
 * No farmers, farms, observations or environmental data are created: farmers register themselves
 * (web, USSD) and all environmental data comes from live providers.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import prisma from '../src/config/prisma.js';
import { ensureDefaultSettings } from '../src/services/settingsService.js';
import { ACTION_LIBRARY } from './data/actionLibrary.js';
import { PERMISSIONS, ROLES, SPECIES } from './data/reference.js';

const here = path.dirname(fileURLToPath(import.meta.url));

async function ensureAdmin(adminRole) {
  const existing = await prisma.user.findFirst({ where: { roles: { some: { roleId: adminRole.id } } } });
  if (existing) return null;
  const email = (process.env.ADMIN_EMAIL || 'admin@mwanimlinzi.local').toLowerCase();
  let password = process.env.ADMIN_PASSWORD;
  const generated = !password;
  if (generated) password = `Mw-${crypto.randomBytes(9).toString('base64url')}7`;
  if (password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters');
  await prisma.user.create({
    data: {
      email, fullName: 'System Administrator', passwordHash: await bcrypt.hash(password, 12),
      preferredLanguage: 'en', consentGiven: true, consentAt: new Date(), roles: { create: { roleId: adminRole.id } },
    },
  });
  if (generated) {
    const file = path.join(here, '..', 'ADMIN_CREDENTIALS.local.txt');
    fs.writeFileSync(file, `MwaniMlinzi AI — first admin account\nEmail: ${email}\nPassword: ${password}\nChange this password after the first login.\n`, { mode: 0o600 });
    console.log(`[seed] created admin ${email} with a generated password: ${password}`);
    console.log('[seed] saved to backend/ADMIN_CREDENTIALS.local.txt — change it after the first login.');
  } else {
    console.log(`[seed] created admin ${email} (password from ADMIN_PASSWORD)`);
  }
  return email;
}

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
  await ensureAdmin(roles.ADMIN);
  console.log(`[seed] roles, permissions, species and settings ensured; ${added} new action-library entries added.`);
}

main().catch((err) => { console.error('[seed] failed:', err); process.exitCode = 1; }).finally(() => prisma.$disconnect());
