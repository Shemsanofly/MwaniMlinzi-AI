import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import prisma from '../config/prisma.js';
import { env } from '../config/env.js';
import { ok, created } from '../utils/response.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { audit } from '../utils/audit.js';
import { pageParams } from '../utils/pagination.js';
import { hasRole, ROLES } from '../middleware/auth.js';
import { DEFAULT_SETTINGS, getAllSettings, setSetting } from '../services/settingsService.js';
import { MLRiskProvider } from '../ai/mlRiskProvider.js';
import { ModelMonitoringService } from '../services/modelMonitoringService.js';
import { JOBS, runJob } from '../jobs/jobs.js';
import { EnvironmentService } from '../services/environmentService.js';
import { getLLMProvider } from '../services/assistantService.js';
import { getSMSProvider } from '../services/notificationService.js';
import { getUSSDProvider } from '../services/channelService.js';
import { assertFarmAccess, isUuid } from '../services/accessService.js';

/* ───────────── Users & roles ───────────── */

const userSelect = {
  id: true, email: true, fullName: true, phone: true, isActive: true, isDemo: true, preferredLanguage: true, lastLoginAt: true, createdAt: true,
  cooperative: { select: { id: true, name: true } }, roles: { select: { role: { select: { name: true } } } },
};
const flatUser = (u) => ({ ...u, roles: u.roles.map((r) => r.role.name) });

export async function listUsers(req, res) {
  const { take, skip, page, limit } = pageParams(req.query);
  const where = {
    ...(req.query.role ? { roles: { some: { role: { name: String(req.query.role) } } } } : {}),
    ...(req.query.search ? { OR: [{ email: { contains: String(req.query.search), mode: 'insensitive' } }, { fullName: { contains: String(req.query.search), mode: 'insensitive' } }] } : {}),
  };
  const [users, total] = await Promise.all([prisma.user.findMany({ where, select: userSelect, orderBy: { createdAt: 'desc' }, take, skip }), prisma.user.count({ where })]);
  return ok(res, { users: users.map(flatUser), total, page, limit });
}

async function roleIds(names) {
  const roles = await prisma.role.findMany({ where: { name: { in: names } } });
  if (roles.length !== names.length) throw badRequest('Unknown role');
  return roles;
}

export async function createUser(req, res) {
  const d = req.valid.body;
  if (await prisma.user.findUnique({ where: { email: d.email } })) throw conflict('Email already in use');
  if (d.phone && (await prisma.user.findUnique({ where: { phone: d.phone } }))) throw conflict('Phone already in use');
  const roles = await roleIds(d.roles);
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        email: d.email, passwordHash: await bcrypt.hash(d.password, 12), fullName: d.fullName, phone: d.phone || null,
        preferredLanguage: d.preferredLanguage, cooperativeId: d.cooperativeId || null, consentGiven: true, consentAt: new Date(),
        roles: { create: roles.map((r) => ({ roleId: r.id })) },
      },
    });
    if (d.roles.includes('FARMER')) {
      const farmer = await tx.farmer.create({ data: { userId: u.id, farmerCode: `FMR-${u.id.slice(0, 8).toUpperCase()}` } });
      if (d.cooperativeId) await tx.cooperativeMember.create({ data: { cooperativeId: d.cooperativeId, farmerId: farmer.id } });
    }
    if (d.roles.includes('BUYER')) await tx.buyer.create({ data: { userId: u.id, companyName: d.fullName, contactName: d.fullName } });
    return u;
  });
  await audit(req, 'CREATE', 'User', user.id, { roles: d.roles });
  return created(res, { user: flatUser(await prisma.user.findUnique({ where: { id: user.id }, select: userSelect })) }, 'User created');
}

export async function updateUser(req, res) {
  const { id } = req.params;
  if (!isUuid(id)) throw notFound('User');
  const existing = await prisma.user.findUnique({ where: { id }, include: { farmer: true, buyer: true } });
  if (!existing) throw notFound('User');
  const { roles, ...data } = req.valid.body;
  if (id === req.user.id && (data.isActive === false || (roles && !roles.includes('ADMIN')))) throw forbidden('You cannot disable or remove the admin role from your own account');
  if (data.phone) {
    const other = await prisma.user.findFirst({ where: { phone: data.phone, NOT: { id } } });
    if (other) throw conflict('Phone already in use');
  }
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data });
    if (roles) {
      const rs = await roleIds(roles);
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({ data: rs.map((r) => ({ userId: id, roleId: r.id })) });
      if (roles.includes('FARMER') && !existing.farmer) await tx.farmer.create({ data: { userId: id, farmerCode: `FMR-${id.slice(0, 8).toUpperCase()}` } });
      if (roles.includes('BUYER') && !existing.buyer) await tx.buyer.create({ data: { userId: id, companyName: existing.fullName } });
    }
  });
  await audit(req, 'UPDATE', 'User', id, { fields: Object.keys(req.valid.body) });
  return ok(res, { user: flatUser(await prisma.user.findUnique({ where: { id }, select: userSelect })) }, 'User updated');
}

export async function listRoles(_req, res) {
  const roles = await prisma.role.findMany({ include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } } });
  return ok(res, { roles: roles.map((r) => ({ id: r.id, name: r.name, description: r.description, users: r._count.users, permissions: r.permissions.map((p) => p.permission.key) })) });
}

/* ───────────── Cooperatives (admin) ───────────── */

export async function createCooperative(req, res) {
  if (await prisma.cooperative.findUnique({ where: { code: req.valid.body.code } })) throw conflict('Cooperative code already exists');
  const coop = await prisma.cooperative.create({ data: req.valid.body });
  await audit(req, 'CREATE', 'Cooperative', coop.id);
  return created(res, { cooperative: coop });
}

export async function updateCooperative(req, res) {
  const coop = await prisma.cooperative.update({ where: { id: req.params.id }, data: req.valid.body });
  await audit(req, 'UPDATE', 'Cooperative', coop.id);
  return ok(res, { cooperative: coop });
}

/* ───────────── Settings ───────────── */

const SETTING_VALIDATORS = {
  'risk.thresholds': (v) => v && ['MEDIUM', 'HIGH', 'CRITICAL'].every((k) => typeof v[k] === 'number' && v[k] > 0 && v[k] < 1) && v.MEDIUM < v.HIGH && v.HIGH < v.CRITICAL,
  'ai.mode': (v) => ['RULE_ONLY', 'HYBRID'].includes(v),
  'ai.mlBlendWeight': (v) => typeof v === 'number' && v >= 0 && v <= 1,
  'ai.minTrainingRecords': (v) => Number.isInteger(v) && v >= 50,
  'actions.requireValidated': (v) => typeof v === 'boolean',
  'alerts.missingReportDays': (v) => Number.isInteger(v) && v >= 1 && v <= 90,
  'alerts.dedupHours': (v) => Number.isInteger(v) && v >= 1 && v <= 168,
  'environment.maxCacheAgeHours': (v) => Number.isInteger(v) && v >= 1 && v <= 720,
  'environment.preferLive': (v) => typeof v === 'boolean',
  'notifications.smsEnabled': (v) => typeof v === 'boolean',
};

export async function getSettings(_req, res) {
  const values = await getAllSettings();
  const rows = await prisma.systemSetting.findMany();
  const meta = Object.fromEntries(rows.map((r) => [r.key, r]));
  const settings = Object.entries(DEFAULT_SETTINGS).map(([key, def]) => ({ key, value: values[key], default: def.value, description: def.description, updatedAt: meta[key]?.updatedAt || null }));
  return ok(res, {
    settings,
    system: {
      demoMode: env.demoMode,
      jobsEnabled: env.enableJobs,
      providers: { ...EnvironmentService.providerStatus(), llm: getLLMProvider().name, sms: getSMSProvider().name, ussd: getUSSDProvider().name },
      note: 'DEMO_MODE and provider credentials are set in backend/.env (never stored in the database).',
    },
  });
}

export async function updateSetting(req, res) {
  const { key } = req.params;
  if (!DEFAULT_SETTINGS[key]) throw notFound('Setting');
  const { value } = req.valid.body;
  if (!SETTING_VALIDATORS[key](value)) throw badRequest(`Invalid value for ${key}`);
  const before = (await getAllSettings())[key];
  const row = await setSetting(key, value, req.user.id);
  if (key.startsWith('ai.')) MLRiskProvider.clearCache();
  await audit(req, 'UPDATE_SETTING', 'SystemSetting', key, { before, after: value });
  return ok(res, { setting: row }, 'Setting updated');
}

/* ───────────── ML models ───────────── */

export async function listModels(_req, res) {
  const models = await prisma.mlModel.findMany({ orderBy: [{ riskType: 'asc' }, { trainedAt: 'desc' }], include: { metrics: { orderBy: { createdAt: 'desc' } }, _count: { select: { predictions: true, feedback: true } } } });
  const field = await ModelMonitoringService.fieldConfusion();
  const feedback = await prisma.modelFeedback.groupBy({ by: ['feedbackType'], _count: { _all: true } });
  const aiMode = (await getAllSettings())['ai.mode'];
  const active = models.filter((m) => m.status === 'ACTIVE');
  return ok(res, {
    status: active.length && aiMode === 'HYBRID' ? `Hybrid: rule baseline + ML (${active.map((m) => `${m.riskType} ${m.version}`).join(', ')})` : 'Rule-based baseline',
    aiMode,
    models: models.map((m) => ({
      ...m,
      predictionCount: m._count.predictions,
      feedbackCount: m._count.feedback,
      testMetrics: Object.fromEntries(m.metrics.filter((x) => x.dataset === 'TEST').map((x) => [x.metric, x.value])),
      confusionMatrix: m.metrics.find((x) => x.dataset === 'TEST' && x.details?.confusionMatrix)?.details?.confusionMatrix || null,
      fieldMetrics: Object.fromEntries(m.metrics.filter((x) => x.dataset === 'FIELD').map((x) => [x.metric, x.value])),
    })),
    ruleBaseline: { version: 'rules-v1', predictions: await prisma.riskPrediction.count({ where: { modelType: 'RULE', isSimulation: false } }) },
    fieldEvaluation: field,
    feedback: feedback.map((f) => ({ type: f.feedbackType, count: f._count._all })),
    training: { command: 'cd backend && npm run ai:dataset && npm run ai:train', note: 'Models trained on synthetic demo data are labelled as such and must be re-trained on field outcomes before real use.' },
  });
}

export async function updateModel(req, res) {
  const model = await prisma.mlModel.findUnique({ where: { id: req.params.id } });
  if (!model) throw notFound('Model');
  const { status } = req.valid.body;
  await prisma.$transaction(async (tx) => {
    // Only one ACTIVE model per risk type.
    if (status === 'ACTIVE') await tx.mlModel.updateMany({ where: { riskType: model.riskType, status: 'ACTIVE' }, data: { status: 'TRAINED' } });
    await tx.mlModel.update({ where: { id: model.id }, data: { status } });
  });
  MLRiskProvider.clearCache();
  await audit(req, 'UPDATE_MODEL_STATUS', 'MlModel', model.id, { status });
  return ok(res, { model: await prisma.mlModel.findUnique({ where: { id: model.id } }) }, `Model ${status.toLowerCase()}`);
}

/* ───────────── Audit, jobs, health ───────────── */

export async function listAudit(req, res) {
  const { take, skip, page, limit } = pageParams(req.query, { limit: 50, max: 200 });
  const where = {
    ...(req.query.action ? { action: String(req.query.action) } : {}),
    ...(req.query.entityType ? { entityType: String(req.query.entityType) } : {}),
    ...(req.query.userId && isUuid(req.query.userId) ? { userId: req.query.userId } : {}),
  };
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip, include: { user: { select: { email: true, fullName: true } } } }),
    prisma.auditLog.count({ where }),
  ]);
  return ok(res, { logs, total, page, limit });
}

export async function listJobs(_req, res) {
  const runs = await prisma.jobRun.findMany({ orderBy: { startedAt: 'desc' }, take: 50 });
  return ok(res, { jobs: Object.entries(JOBS).map(([name, j]) => ({ name, schedule: j.schedule, description: j.description, lastRun: runs.find((r) => r.jobName === name) || null })), recentRuns: runs, schedulerEnabled: env.enableJobs });
}

export async function runJobNow(req, res) {
  const { name } = req.params;
  if (!JOBS[name]) throw notFound('Job');
  const run = await runJob(name, 'MANUAL');
  await audit(req, 'RUN_JOB', 'Job', name);
  return ok(res, { run }, `Job ${name} finished`);
}

export async function notificationLogs(req, res) {
  const logs = await prisma.notificationLog.findMany({ orderBy: { createdAt: 'desc' }, take: Math.min(Number(req.query.limit) || 100, 300) });
  return ok(res, { logs });
}

/* ───────────── Action library ───────────── */

export async function listActionLibrary(req, res) {
  const where = {
    ...(req.query.riskType ? { riskType: String(req.query.riskType) } : {}),
    ...(req.query.enabled ? { enabled: req.query.enabled === 'true' } : {}),
  };
  const actions = await prisma.actionLibrary.findMany({ where, orderBy: [{ riskType: 'asc' }, { minimumRiskLevel: 'asc' }, { priority: 'desc' }], include: { validatedBy: { select: { fullName: true } }, _count: { select: { recommendations: true } } } });
  return ok(res, { actions });
}

export async function getActionLibrary(req, res) {
  if (!isUuid(req.params.id)) throw notFound('Action');
  const action = await prisma.actionLibrary.findUnique({ where: { id: req.params.id }, include: { validatedBy: { select: { fullName: true } } } });
  if (!action) throw notFound('Action');
  return ok(res, { action });
}

export async function createActionLibrary(req, res) {
  if (await prisma.actionLibrary.findUnique({ where: { code: req.valid.body.code } })) throw conflict('Action code already exists');
  const action = await prisma.actionLibrary.create({ data: { ...req.valid.body, validated: false } });
  await audit(req, 'CREATE', 'ActionLibrary', action.id, { code: action.code });
  return created(res, { action }, 'Action created (pending validation)');
}

export async function updateActionLibrary(req, res) {
  const existing = await prisma.actionLibrary.findUnique({ where: { id: req.params.id } });
  if (!existing) throw notFound('Action');
  const textChanged = ['action', 'actionSw', 'explanation', 'explanationSw', 'conditions', 'minimumRiskLevel', 'maximumRiskLevel', 'riskType'].some((k) => req.valid.body[k] !== undefined);
  // Any change to what farmers are told invalidates the previous expert validation.
  const action = await prisma.actionLibrary.update({ where: { id: existing.id }, data: { ...req.valid.body, ...(textChanged ? { validated: false, validatedById: null, validatedAt: null } : {}) } });
  await audit(req, 'UPDATE', 'ActionLibrary', action.id, { fields: Object.keys(req.valid.body), validationReset: textChanged });
  return ok(res, { action }, 'Action updated');
}

export async function validateActionLibrary(req, res) {
  const existing = await prisma.actionLibrary.findUnique({ where: { id: req.params.id } });
  if (!existing) throw notFound('Action');
  const { validated, note } = req.valid.body;
  const action = await prisma.actionLibrary.update({ where: { id: existing.id }, data: { validated, validationNote: note || null, validatedById: validated ? req.user.id : null, validatedAt: validated ? new Date() : null } });
  await audit(req, validated ? 'VALIDATE_ACTION' : 'UNVALIDATE_ACTION', 'ActionLibrary', action.id, { note });
  return ok(res, { action }, validated ? 'Action validated' : 'Validation removed');
}

/* ───────────── Uploads ───────────── */

const MAGIC = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP',
};
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const uploadRoot = () => path.resolve(process.cwd(), env.uploadDir);

/**
 * Local storage implementation of the file-storage abstraction: files are validated by
 * MIME type AND magic bytes, renamed to a random name, and served only via an authorised route.
 */
export async function uploadImage(req, res) {
  const file = req.file;
  if (!file) throw badRequest('No image uploaded (field name: image)');
  if (!MAGIC[file.mimetype] || !MAGIC[file.mimetype](file.buffer)) throw badRequest('Only JPEG, PNG or WebP images are allowed');
  const storedName = `${crypto.randomUUID()}.${EXT[file.mimetype]}`;
  await fs.mkdir(uploadRoot(), { recursive: true });
  await fs.writeFile(path.join(uploadRoot(), storedName), file.buffer, { flag: 'wx' });
  const row = await prisma.uploadedFile.create({ data: { originalName: path.basename(file.originalname).slice(0, 200), storedName, mimeType: file.mimetype, sizeBytes: file.size, uploadedById: req.user.id } });
  await audit(req, 'UPLOAD', 'UploadedFile', row.id, { sizeBytes: file.size, mimeType: file.mimetype });
  return created(res, { file: { id: row.id, mimeType: row.mimeType, sizeBytes: row.sizeBytes } }, 'Image uploaded');
}

export async function getUpload(req, res) {
  if (!isUuid(req.params.id)) throw notFound('File');
  const file = await prisma.uploadedFile.findUnique({ where: { id: req.params.id }, include: { observations: { select: { farmId: true }, take: 1 } } });
  if (!file) throw notFound('File');
  if (file.uploadedById !== req.user.id && !hasRole(req.user, ROLES.ADMIN)) {
    if (!file.observations[0]) throw forbidden();
    await assertFarmAccess(req.user, file.observations[0].farmId);
  }
  const full = path.join(uploadRoot(), path.basename(file.storedName));
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.sendFile(full, (err) => { if (err && !res.headersSent) res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'File missing' } }); });
}
