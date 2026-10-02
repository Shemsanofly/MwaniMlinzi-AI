import { events } from '../db/records.js';
import prisma from '../config/prisma.js';
import { ok } from '../utils/response.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { audit } from '../utils/audit.js';
import { hasRole, ROLES } from '../middleware/auth.js';
import { assertFarmAccess, farmScope, isUuid } from '../services/accessService.js';
import { EnvironmentService } from '../services/environmentService.js';
import { RiskService } from '../services/riskService.js';
import { NotificationService } from '../services/notificationService.js';
import { HarvestForecastService } from '../services/harvestForecastService.js';
import { AssistantService, getLLMProvider } from '../services/assistantService.js';
import { MLRiskProvider } from '../ai/mlRiskProvider.js';
import { atConfig } from '../providers/africastalking/config.js';
import { getSetting } from '../services/settingsService.js';
import { addDays } from '../utils/dates.js';
import { getGeocodingService } from '../services/geocodingService.js';

export async function reverseGeocode(req, res) {
  return ok(res, await getGeocodingService().reverse(req.valid.query));
}

/* ───────────── Environment ───────────── */

async function resolveFarmForEnv(req) {
  const farmId = req.query.farmId;
  if (farmId) {
    if (!isUuid(farmId)) throw notFound('Farm');
    await assertFarmAccess(req.user, farmId);
    return prisma.farm.findUnique({ where: { id: farmId } });
  }
  const farm = await prisma.farm.findFirst({ where: farmScope(req.user), orderBy: { farmCode: 'asc' } });
  if (!farm) throw badRequest('farmId is required');
  return farm;
}

export async function environmentCurrent(req, res) {
  const farm = await resolveFarmForEnv(req);
  const current = await EnvironmentService.currentForFarm(farm);
  return ok(res, { farmId: farm.id, farmCode: farm.farmCode, current, providers: EnvironmentService.providerStatus() });
}

export async function environmentHistory(req, res) {
  const farm = await resolveFarmForEnv(req);
  const history = await EnvironmentService.history(farm.id, Math.min(Number(req.query.days) || 14, 90));
  return ok(res, { farmId: farm.id, history });
}

export async function environmentProviders(_req, res) {
  return ok(res, EnvironmentService.providerStatus());
}

/* ───────────── Risk & simulation ───────────── */

/** POST /api/risk/predict — runs the AI for a farm. With `overrides` it is a SIMULATION (stored, flagged, never shown as real).
 *  The what-if override path is admin-only; a plain prediction (no overrides) is open to any farmer or staff
 *  with farm access. Keeps the route permissive while gating the simulated/experimental path. */
export async function predict(req, res) {
  const { farmId, overrides } = req.valid.body;
  await assertFarmAccess(req.user, farmId);
  const hasOverrides = overrides && Object.values(overrides).some((v) => v !== undefined);
  if (hasOverrides && !hasRole(req.user, ROLES.ADMIN)) throw forbidden('What-if simulations are admin-only');
  const baseline = hasOverrides ? await RiskService.latestForFarm(farmId) : null;
  const result = await RiskService.runForFarm(farmId, { trigger: 'MANUAL', overrides: hasOverrides ? overrides : null });
  await audit(req, hasOverrides ? 'SIMULATE_RISK' : 'RUN_RISK', 'Farm', farmId, hasOverrides ? { overrides } : null);
  return ok(res, { ...result, baseline }, hasOverrides ? 'Simulation complete' : 'Prediction complete');
}

export async function riskForFarm(req, res) {
  const { farmId } = req.params;
  if (!isUuid(farmId)) throw notFound('Farm');
  await assertFarmAccess(req.user, farmId);
  let r = await RiskService.latestForFarm(farmId);
  if (!r.predictions.length) r = await RiskService.runForFarm(farmId, { trigger: 'MANUAL' });
  return ok(res, r);
}

export async function flagPrediction(req, res) {
  const p = await prisma.riskPrediction.findUnique({ where: { id: req.params.id } });
  if (!p) throw notFound('Prediction');
  await assertFarmAccess(req.user, p.farmId);
  const { reason, feedbackType } = req.valid.body;
  const [updated, feedback] = await prisma.$transaction([
    prisma.riskPrediction.update({ where: { id: p.id }, data: { flagged: feedbackType !== 'CORRECT', flagReason: reason, flaggedById: req.user.id } }),
    events(prisma, 'FEEDBACK').create({ data: { riskPredictionId: p.id, modelId: p.mlModelId || null, userId: req.user.id, feedbackType, notes: reason } }),
  ]);
  await audit(req, 'FLAG_PREDICTION', 'RiskPrediction', p.id, { feedbackType, reason });
  return ok(res, { prediction: { id: updated.id, flagged: updated.flagged, flagReason: updated.flagReason }, feedback }, 'Feedback recorded');
}

/* ───────────── Alerts & notifications ───────────── */

export async function listAlerts(req, res) {
  const { status, severity, type, farmId, includeSimulation } = req.query;
  const alerts = await prisma.alert.findMany({
    where: {
      farm: farmScope(req.user),
      ...(status ? { status: { in: String(status).split(',') } } : {}),
      ...(severity ? { severity: { in: String(severity).split(',') } } : {}),
      ...(type ? { type: { in: String(type).split(',') } } : {}),
      ...(farmId && isUuid(farmId) ? { farmId } : {}),
      ...(includeSimulation === 'true' ? {} : { isSimulation: false }),
    },
    include: { farm: { select: { id: true, farmCode: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Number(req.query.limit) || 100, 300),
  });
  return ok(res, { alerts });
}

export async function updateAlert(req, res) {
  const alert = await prisma.alert.findUnique({ where: { id: req.params.id } });
  if (!alert) throw notFound('Alert');
  await assertFarmAccess(req.user, alert.farmId);
  const status = req.body?.status;
  if (!['ACKNOWLEDGED', 'RESOLVED'].includes(status)) throw badRequest('status must be ACKNOWLEDGED or RESOLVED');
  const updated = await prisma.alert.update({ where: { id: alert.id }, data: { status, acknowledgedById: req.user.id, acknowledgedAt: new Date() } });
  await audit(req, 'UPDATE', 'Alert', alert.id, { status });
  return ok(res, { alert: updated });
}

export async function listNotifications(req, res) {
  const notifications = await NotificationService.listForUser(req.user.id, { unreadOnly: req.query.unread === 'true' });
  const unread = await prisma.notification.count({ where: { userId: req.user.id, channel: 'IN_APP', readAt: null } });
  return ok(res, { notifications, unread });
}

export async function readNotification(req, res) {
  const n = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!n || n.userId !== req.user.id) throw notFound('Notification');
  await prisma.notification.update({ where: { id: n.id }, data: { readAt: new Date() } });
  return ok(res, {}, 'Marked as read');
}

export async function readAllNotifications(req, res) {
  const r = await prisma.notification.updateMany({ where: { userId: req.user.id, readAt: null }, data: { readAt: new Date() } });
  return ok(res, { updated: r.count });
}

/* ───────────── Harvest forecasts ───────────── */

function forecastFilters(q) {
  const from = q.from ? new Date(q.from) : undefined;
  const to = q.to ? new Date(q.to) : q.days ? addDays(new Date(), Number(q.days)) : undefined;
  return { from, to, district: q.district, cooperativeId: q.cooperativeId, minQuantityKg: q.minQuantityKg, grade: q.grade };
}

export async function harvestForecasts(req, res) {
  const q = req.valid.query;
  const forecasts = await HarvestForecastService.list({ where: { farm: farmScope(req.user) }, ...forecastFilters(q) });
  const summary = HarvestForecastService.aggregate(forecasts);
  return ok(res, { forecasts, summary });
}

export async function generateForecasts(req, res) {
  const rows = await HarvestForecastService.generate();
  await audit(req, 'GENERATE_FORECASTS', 'HarvestForecast', null, { count: rows.length });
  return ok(res, { generated: rows.length }, 'Forecasts regenerated');
}

/* ───────────── AI assistant & status ───────────── */

export async function chat(req, res) {
  const result = await AssistantService.chat(req.user, req.valid.body);
  await audit(req, 'AI_CHAT', 'Assistant', result.farm?.id || null, { intent: result.intent, generatedBy: result.generatedBy });
  return ok(res, result);
}

export async function aiStatus(_req, res) {
  const llm = getLLMProvider();
  const ml = await MLRiskProvider.status();
  const aiMode = await getSetting('ai.mode');
  return ok(res, {
    riskModel: Object.keys(ml).length && aiMode === 'HYBRID' ? { mode: 'HYBRID', label: 'Hybrid: rule baseline + ML', activeModels: ml } : { mode: 'RULE', label: 'Rule-based baseline', activeModels: ml },
    aiMode,
    llm: { provider: llm.name, live: llm.isLive, note: llm.isLive ? 'LLM rephrases approved answers only.' : 'No LLM key configured — deterministic templates are used.' },
  });
}

/* ───────────── Meta ───────────── */

export async function species(_req, res) {
  const rows = await prisma.seaweedSpecies.findMany({ orderBy: { commonName: 'asc' } });
  return ok(res, { species: rows });
}

export async function publicCooperatives(_req, res) {
  const rows = await prisma.cooperative.findMany({ select: { code: true, name: true, district: true }, orderBy: { name: 'asc' } });
  return ok(res, { cooperatives: rows });
}

export async function health(_req, res) {
  let database = 'ok';
  try { await prisma.$queryRaw`SELECT 1`; } catch { database = 'unavailable'; }
  const status = database === 'ok' ? 200 : 503;
  return res.status(status).json({
    success: database === 'ok',
    data: {
      status: database === 'ok' ? 'ok' : 'degraded',
      database,
      providers: { ...EnvironmentService.providerStatus(), llm: getLLMProvider().name, sms: atConfig().smsConfigured ? `africastalking-${atConfig().environment}` : 'NOT_CONFIGURED', ussd: atConfig().ussdConfigured ? `africastalking-${atConfig().environment}` : 'NOT_CONFIGURED' },
      time: new Date().toISOString(),
    },
    message: database === 'ok' ? 'Healthy' : 'Database unavailable',
  });
}
