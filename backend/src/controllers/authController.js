import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import prisma from '../config/prisma.js';
import { loadUser, signToken } from '../middleware/auth.js';
import { ok, created } from '../utils/response.js';
import { AppError, badRequest, conflict } from '../utils/errors.js';
import { audit } from '../utils/audit.js';
import { maskPhone, normalizeTzPhone } from '../utils/phone.js';
import { SMSService } from '../services/smsService.js';

// Used to equalise response time when the email does not exist.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-password', 12);

const primaryRole = (roles) => ['ADMIN', 'FARMER'].find((r) => roles.includes(r)) || roles[0];
const withPrimary = (u) => ({ ...u, primaryRole: primaryRole(u.roles) });

export async function register(req, res) {
  const d = req.valid.body;
  if (await prisma.user.findUnique({ where: { phone: d.phone } })) throw conflict('An account with this phone number already exists');
  if (d.email && (await prisma.user.findUnique({ where: { email: d.email } }))) throw conflict('An account with this email already exists');
  let cooperative = null;
  if (d.cooperativeCode) {
    cooperative = await prisma.cooperative.findUnique({ where: { code: d.cooperativeCode.toUpperCase() } });
    if (!cooperative) throw badRequest('Unknown cooperative code');
  }
  const role = await prisma.role.findUnique({ where: { name: d.role } });
  if (!role) throw new AppError('SETUP_REQUIRED', 'Roles are not seeded. Run `npm run seed`.', 500);
  const passwordHash = await bcrypt.hash(d.password, 12);

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        email: d.email || null, passwordHash, fullName: d.fullName, phone: d.phone, preferredLanguage: d.preferredLanguage,
        smsEnabled: d.smsEnabled ?? true, consentGiven: true, consentAt: new Date(), roles: { create: { roleId: role.id } },
      },
    });
    if (d.role === 'FARMER') {
      const count = await tx.farmer.count();
      const farmer = await tx.farmer.create({ data: { userId: u.id, farmerCode: `FMR-${String(count + 1).padStart(4, '0')}-${u.id.slice(0, 4).toUpperCase()}`, village: d.village || null, district: d.district || null } });
      if (cooperative) await tx.cooperativeMember.create({ data: { cooperativeId: cooperative.id, farmerId: farmer.id } });
    }
    return u;
  });
  req.user = { id: user.id };
  await audit(req, 'REGISTER', 'User', user.id, { role: d.role });
  const full = await loadUser(user.id);
  return created(res, { token: signToken(user), user: withPrimary(full) }, 'Account created');
}

/** Finds a user by phone (any Tanzanian format) or email. */
async function findByIdentifier(identifier) {
  const id = String(identifier || '').trim();
  if (id.includes('@')) return prisma.user.findUnique({ where: { email: id.toLowerCase() } });
  const phone = normalizeTzPhone(id);
  return phone ? prisma.user.findUnique({ where: { phone } }) : null;
}

export async function login(req, res) {
  const { identifier, email, password } = req.valid.body;
  const user = await findByIdentifier(identifier || email);
  // Same message for unknown account and wrong password (no account enumeration).
  const valid = user ? await bcrypt.compare(password, user.passwordHash) : await bcrypt.compare(password, DUMMY_HASH).then(() => false);
  if (!user || !valid) throw new AppError('INVALID_CREDENTIALS', 'Incorrect phone/email or password', 401);
  if (!user.isActive) throw new AppError('ACCOUNT_DISABLED', 'This account has been disabled', 403);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  req.user = { id: user.id };
  await audit(req, 'LOGIN', 'User', user.id);
  const full = await loadUser(user.id);
  return ok(res, { token: signToken(user), user: withPrimary(full) }, 'Logged in');
}

export async function me(req, res) {
  const cooperative = req.user.cooperativeId ? await prisma.cooperative.findUnique({ where: { id: req.user.cooperativeId }, select: { id: true, name: true, code: true } }) : null;
  const memberships = req.user.farmerId ? await prisma.cooperativeMember.findMany({ where: { farmerId: req.user.farmerId }, include: { cooperative: { select: { id: true, name: true, code: true } } } }) : [];
  return ok(res, { user: withPrimary(req.user), cooperative, memberships: memberships.map((m) => m.cooperative) });
}

export async function updateMe(req, res) {
  const d = req.valid.body;
  if (d.phone) {
    const other = await prisma.user.findFirst({ where: { phone: d.phone, NOT: { id: req.user.id } } });
    if (other) throw conflict('Phone number already in use');
  }
  if (d.email) {
    const other = await prisma.user.findFirst({ where: { email: d.email, NOT: { id: req.user.id } } });
    if (other) throw conflict('Email already in use');
  }
  await prisma.user.update({ where: { id: req.user.id }, data: d });
  await audit(req, 'UPDATE_PROFILE', 'User', req.user.id, { fields: Object.keys(d) });
  return ok(res, { user: withPrimary(await loadUser(req.user.id)) }, 'Profile updated');
}

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.valid.body;
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw new AppError('WRONG_PASSWORD', 'Current password is incorrect', 400);
  if (currentPassword === newPassword) throw badRequest('The new password must be different');
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } });
  await audit(req, 'CHANGE_PASSWORD', 'User', user.id);
  return ok(res, {}, 'Password changed');
}

export async function logout(req, res) {
  // JWTs are stateless: the client discards the token. We record the event for the audit trail.
  await audit(req, 'LOGOUT', 'User', req.user.id);
  return ok(res, {}, 'Logged out');
}

/* ───────────── Password reset by SMS code ───────────── */

export const RESET_CODE_TTL_MS = 15 * 60 * 1000;
const RESET_MAX_ATTEMPTS = 5;
const RESET_MAX_PER_WINDOW = 3; // codes per number per TTL window
const RESET_SMS = {
  sw: (code) => `MWANIMLINZI: Namba yako ya kubadilisha nenosiri ni ${code}. Inaisha baada ya dakika 15. Usimpe mtu yeyote.`,
  en: (code) => `MWANIMLINZI: Your password reset code is ${code}. It expires in 15 minutes. Do not share it with anyone.`,
};

/**
 * Step 1: send a 6-digit code by SMS. The reply is the same whether or not the number is registered
 * (no account enumeration). If SMS is not configured, say so instead of pretending a code was sent.
 */
export async function forgotPassword(req, res) {
  const { phone } = req.valid.body;
  if (!SMSService.isConfigured()) {
    throw new AppError('NOT_CONFIGURED', 'Password reset by SMS is not available because SMS is not configured. Please contact your cooperative or an administrator.', 503);
  }
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || !user.isActive) {
    await bcrypt.hash('timing-equaliser', 10);
    return ok(res, {}, 'If this number is registered, a reset code has been sent by SMS.');
  }
  const since = new Date(Date.now() - RESET_CODE_TTL_MS);
  const recent = await prisma.passwordReset.count({ where: { userId: user.id, createdAt: { gte: since } } });
  if (recent >= RESET_MAX_PER_WINDOW) {
    await audit(req, 'PASSWORD_RESET_THROTTLED', 'User', user.id);
    return ok(res, {}, 'If this number is registered, a reset code has been sent by SMS.');
  }
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await prisma.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
  const reset = await prisma.passwordReset.create({
    data: { userId: user.id, codeHash: await bcrypt.hash(code, 10), expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS) },
  });
  const lang = user.preferredLanguage === 'en' ? 'en' : 'sw';
  const sent = await SMSService.sendRaw(phone, RESET_SMS[lang](code), { type: 'PASSWORD_RESET', language: lang, logMessage: RESET_SMS[lang]('******') });
  if (!['QUEUED', 'SENT', 'DELIVERED'].includes(sent.status)) {
    await prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } });
    console.warn(`[auth] reset code SMS to ${maskPhone(phone)} not sent: ${sent.status}`);
    throw new AppError('PROVIDER_ERROR', 'We could not send the SMS. Please try again later.', 502);
  }
  req.user = { id: user.id };
  await audit(req, 'PASSWORD_RESET_REQUESTED', 'User', user.id);
  return ok(res, {}, 'If this number is registered, a reset code has been sent by SMS.');
}

/** Step 2: check the code (limited attempts, expires after 15 minutes) and set the new password. */
export async function resetPassword(req, res) {
  const { phone, code, newPassword } = req.valid.body;
  const invalid = () => new AppError('INVALID_CODE', 'The code is wrong or has expired. Request a new code.', 400);
  const user = await prisma.user.findUnique({ where: { phone } });
  const reset = user?.isActive
    ? await prisma.passwordReset.findFirst({ where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } })
    : null;
  if (!reset) { await bcrypt.compare(code, DUMMY_HASH); throw invalid(); }
  if (!(await bcrypt.compare(code, reset.codeHash))) {
    const attempts = reset.attempts + 1;
    await prisma.passwordReset.update({ where: { id: reset.id }, data: { attempts, usedAt: attempts >= RESET_MAX_ATTEMPTS ? new Date() : null } });
    throw invalid();
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } }),
    prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
  ]);
  req.user = { id: user.id };
  await audit(req, 'PASSWORD_RESET', 'User', user.id);
  return ok(res, {}, 'Password changed. You can now log in.');
}
