import bcrypt from 'bcryptjs';
import prisma from '../config/prisma.js';
import { loadUser, signToken } from '../middleware/auth.js';
import { ok, created } from '../utils/response.js';
import { AppError, badRequest, conflict } from '../utils/errors.js';
import { audit } from '../utils/audit.js';

// Used to equalise response time when the email does not exist.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-password', 12);

const primaryRole = (roles) => ['ADMIN', 'COOPERATIVE_ADMIN', 'EXTENSION_OFFICER', 'BUYER', 'FARMER'].find((r) => roles.includes(r)) || roles[0];
const withPrimary = (u) => ({ ...u, primaryRole: primaryRole(u.roles) });

export async function register(req, res) {
  const d = req.valid.body;
  if (await prisma.user.findUnique({ where: { email: d.email } })) throw conflict('An account with this email already exists');
  if (d.phone && (await prisma.user.findUnique({ where: { phone: d.phone } }))) throw conflict('An account with this phone number already exists');
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
        email: d.email, passwordHash, fullName: d.fullName, phone: d.phone || null, preferredLanguage: d.preferredLanguage,
        consentGiven: true, consentAt: new Date(), roles: { create: { roleId: role.id } },
      },
    });
    if (d.role === 'FARMER') {
      const count = await tx.farmer.count();
      const farmer = await tx.farmer.create({ data: { userId: u.id, farmerCode: `FMR-${String(count + 1).padStart(4, '0')}-${u.id.slice(0, 4).toUpperCase()}`, village: d.village || null, district: d.district || null } });
      if (cooperative) await tx.cooperativeMember.create({ data: { cooperativeId: cooperative.id, farmerId: farmer.id } });
    } else if (d.role === 'BUYER') {
      await tx.buyer.create({ data: { userId: u.id, companyName: d.companyName || d.fullName, contactName: d.fullName, phone: d.phone || null } });
    }
    return u;
  });
  req.user = { id: user.id };
  await audit(req, 'REGISTER', 'User', user.id, { role: d.role });
  const full = await loadUser(user.id);
  return created(res, { token: signToken(user), user: withPrimary(full) }, 'Account created');
}

export async function login(req, res) {
  const { email, password } = req.valid.body;
  const user = await prisma.user.findUnique({ where: { email } });
  // Same message for unknown email and wrong password (no account enumeration).
  const valid = user ? await bcrypt.compare(password, user.passwordHash) : await bcrypt.compare(password, DUMMY_HASH).then(() => false);
  if (!user || !valid) throw new AppError('INVALID_CREDENTIALS', 'Incorrect email or password', 401);
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
  await prisma.user.update({ where: { id: req.user.id }, data: d });
  await audit(req, 'UPDATE_PROFILE', 'User', req.user.id, { fields: Object.keys(d) });
  return ok(res, { user: withPrimary(await loadUser(req.user.id)) }, 'Profile updated');
}

export async function logout(req, res) {
  // JWTs are stateless: the client discards the token. We record the event for the audit trail.
  await audit(req, 'LOGOUT', 'User', req.user.id);
  return ok(res, {}, 'Logged out');
}
