/**
 * MwaniMlinzi AI — reference-data seed (safe to run any time; never deletes anything).
 *
 *   npm run seed
 *
 * Upserts roles, permissions, seaweed species, default system settings and the Action Library,
 * then ensures one login per role so the whole system is usable right after `npm run seed`:
 *
 *   - admin@mwanimlinzi.local       — ADMIN
 *   - officer@mwanimlinzi.local     — EXTENSION_OFFICER
 *   - coop@mwanimlinzi.local        — COOPERATIVE_ADMIN (linked to the "Pwani Jipya" demo coop)
 *   - farmer@mwanimlinzi.local      — FARMER
 *
 * ADMIN_EMAIL / ADMIN_PASSWORD override the admin's email/password (min. 12 chars). Any missing
 * password is generated, printed once and written to backend/DEMO_CREDENTIALS.local.txt (git-ignored).
 *
 * No farms, observations or environmental data are created. Farmers register themselves (web, USSD)
 * and all environmental data comes from live providers.
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

const DEMO_COOP = { code: 'PWANI_JIPYA', name: 'Pwani Jipya Cooperative', district: 'North Unguja', region: 'Unguja', description: 'Demo cooperative for the pilot — real cooperatives replace it in production.' };
const randomPassword = () => `Mw-${crypto.randomBytes(9).toString('base64url')}7`;

async function ensureCooperative() {
  return prisma.cooperative.upsert({ where: { code: DEMO_COOP.code }, update: {}, create: DEMO_COOP });
}

/** Create a user if the email is not already taken. Returns { email, password | null } for the credentials file. */
async function ensureUser({ email, fullName, roleId, cooperativeId = null, preferredLanguage = 'en', envVar = null }) {
  const normalised = email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalised } });
  if (existing) {
    // Make sure the account carries this role (upgrade path for older DBs).
    const has = await prisma.userRole.findUnique({ where: { userId_roleId: { userId: existing.id, roleId } } }).catch(() => null);
    if (!has) await prisma.userRole.create({ data: { userId: existing.id, roleId } });
    return { email: normalised, password: null, alreadyExisted: true };
  }
  let password = envVar ? process.env[envVar] : null;
  const generated = !password;
  if (generated) password = randomPassword();
  if (password.length < 12) throw new Error(`${envVar || email} password must be at least 12 characters`);
  await prisma.user.create({
    data: {
      email: normalised, fullName, passwordHash: await bcrypt.hash(password, 12),
      preferredLanguage, consentGiven: true, consentAt: new Date(),
      cooperativeId, roles: { create: { roleId } },
    },
  });
  return { email: normalised, password, alreadyExisted: false };
}

function writeCredentialsFile(entries) {
  const lines = ['MwaniMlinzi AI — demo accounts (one per role)', '', 'Keep this file private. Change the passwords after your first login.', ''];
  for (const e of entries) {
    lines.push(`${e.role}`);
    lines.push(`  Email: ${e.email}`);
    lines.push(`  Password: ${e.password ?? '(unchanged — already existed)'}`);
    if (e.notes) lines.push(`  ${e.notes}`);
    lines.push('');
  }
  const file = path.join(here, '..', 'DEMO_CREDENTIALS.local.txt');
  fs.writeFileSync(file, lines.join('\n'), { mode: 0o600 });
  return file;
}

async function main() {
  const roles = {};
  for (const r of ROLES) roles[r.name] = await prisma.role.upsert({ where: { name: r.name }, update: { description: r.description }, create: r });
  for (const role of Object.values(roles)) {
    const keys = Object.entries(PERMISSIONS).filter(([, names]) => names.includes(role.name)).map(([key]) => key);
    await prisma.role.update({ where: { id: role.id }, data: { permissions: [...new Set([...role.permissions, ...keys])] } });
  }
  for (const s of SPECIES) await prisma.seaweedSpecies.upsert({ where: { code: s.code }, update: {}, create: s });
  await ensureDefaultSettings();
  let added = 0;
  for (const a of ACTION_LIBRARY) {
    const exists = await prisma.actionLibrary.findUnique({ where: { code: a.code } });
    if (!exists) { await prisma.actionLibrary.create({ data: a }); added += 1; }
  }

  const coop = await ensureCooperative();
  const demo = [];
  demo.push({ role: 'ADMIN', ...await ensureUser({ email: process.env.ADMIN_EMAIL || 'admin@mwanimlinzi.local', fullName: 'System Administrator', roleId: roles.ADMIN.id, preferredLanguage: 'en', envVar: 'ADMIN_PASSWORD' }) });
  demo.push({ role: 'EXTENSION_OFFICER', ...await ensureUser({ email: 'officer@mwanimlinzi.local', fullName: 'Demo Extension Officer', roleId: roles.EXTENSION_OFFICER.id, preferredLanguage: 'en' }) });
  demo.push({ role: 'COOPERATIVE_ADMIN', ...await ensureUser({ email: 'coop@mwanimlinzi.local', fullName: 'Demo Cooperative Lead', roleId: roles.COOPERATIVE_ADMIN.id, cooperativeId: coop.id, preferredLanguage: 'sw' }), notes: `Linked to cooperative "${coop.name}" (${coop.code}).` });
  demo.push({ role: 'FARMER', ...await ensureUser({ email: 'farmer@mwanimlinzi.local', fullName: 'Demo Farmer', roleId: roles.FARMER.id, preferredLanguage: 'sw' }), notes: 'A FARMER needs to add a farm after first login.' });

  const freshlyCreated = demo.filter((d) => !d.alreadyExisted && d.password);
  if (freshlyCreated.length) {
    const file = writeCredentialsFile(demo);
    console.log(`[seed] created ${freshlyCreated.length} demo account(s); credentials saved to ${path.relative(path.join(here, '..'), file)}:`);
    for (const d of freshlyCreated) console.log(`         ${d.role.padEnd(18)} ${d.email}  —  ${d.password}`);
  } else {
    console.log('[seed] demo accounts already present (no credentials file written).');
  }

  console.log(`[seed] roles, permissions, species and settings ensured; ${added} new action-library entries added.`);
}

main().catch((err) => { console.error('[seed] failed:', err); process.exitCode = 1; }).finally(() => prisma.$disconnect());
