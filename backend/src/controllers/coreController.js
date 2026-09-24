import crypto from 'node:crypto';
import prisma from '../config/prisma.js';
import { env } from '../config/env.js';
import { ok, created } from '../utils/response.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { audit } from '../utils/audit.js';
import { hasRole, ROLES } from '../middleware/auth.js';
import { assertFarmAccess, farmScope, isUuid } from '../services/accessService.js';
import { EnvironmentService } from '../services/environmentService.js';
import { RiskService } from '../services/riskService.js';
import { NotificationService } from '../services/notificationService.js';
import { HarvestForecastService } from '../services/harvestForecastService.js';
import { AssistantService, getLLMProvider } from '../services/assistantService.js';
import { processSms, processUssd, getUSSDProvider } from '../services/channelService.js';
import { MLRiskProvider } from '../ai/mlRiskProvider.js';
import { getSMSProvider } from '../services/notificationService.js';
import { getSetting } from '../services/settingsService.js';
import { addDays } from '../utils/dates.js';

/* ───────────── Environment ───────────── */

async function resolveFarmForEnv(req) {
  const farmId = req.query.farmId;
  if (farmId) {
    if (!isUuid(farmId)) throw notFound('Farm');
    await assertFarmAccess(req.user, farmId);
    return prisma.farm.findUnique({ where: { id: farmId }, include: { location: true } });
  }
  const farm = await prisma.farm.findFirst({ where: farmScope(req.user), include: { location: true }, orderBy: { farmCode: 'asc' } });
  if (!farm) throw badRequest('farmId is required');
  return farm;
}

export async function environmentCurrent(req, res) {
  const farm = await resolveFarmForEnv(req);
  const current = await EnvironmentService.currentForFarm(farm);
  return ok(res, { farmId: farm.id, farmCode: farm.farmCode, current, demoMode: env.demoMode, providers: EnvironmentService.providerStatus() });
}

export async function environmentHistory(req, res) {
  const farm = await resolveFarmForEnv(req);
  const history = await EnvironmentService.history(farm.id, Math.min(Number(req.query.days) || 14, 90));
  return ok(res, { farmId: farm.id, history });
}

export async function environmentProviders(_req, res) {
  return ok(res, { demoMode: env.demoMode, ...EnvironmentService.providerStatus() });
}

/* ───────────── Risk & simulation ───────────── */

/** POST /api/risk/predict — runs the AI for a farm. With `overrides` it is a SIMULATION (stored, flagged, never shown as real). */
export async function predict(req, res) {
  const { farmId, overrides } = req.valid.body;
  await assertFarmAccess(req.user, farmId);
  const hasOverrides = overrides && Object.values(overrides).some((v) => v !== undefined);
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
  const mp = await prisma.modelPrediction.findFirst({ where: { riskPredictionId: p.id } });
  const [updated, feedback] = await prisma.$transaction([
    prisma.riskPrediction.update({ where: { id: p.id }, data: { flagged: feedbackType !== 'CORRECT', flagReason: reason, flaggedById: req.user.id } }),
    prisma.modelFeedback.create({ data: { riskPredictionId: p.id, modelId: mp?.modelId || null, userId: req.user.id, feedbackType, notes: reason } }),
  ]);
  await audit(req, 'FLAG_PREDICTION', 'RiskPrediction', p.id, { feedbackType, reason });
  return ok(res, { prediction: { id: updated.id, flagged: updated.flagged, flagReason: updated.flagReason }, feedback }, 'Feedback recorded');
}

/* ───────────── Alerts & notifications ───────────── */

export async function listAlerts(req, res) {
  const { status, severity, type, farmId, includeSimulation } = req.query;
  if (hasRole(req.user, ROLES.BUYER) && req.user.roles.length === 1) throw forbidden();
  const alerts = await prisma.alert.findMany({
    where: {
      farm: farmScope(req.user),
      ...(status ? { status: { in: String(status).split(',') } } : {}),
      ...(severity ? { severity: { in: String(severity).split(',') } } : {}),
      ...(type ? { type: { in: String(type).split(',') } } : {}),
      ...(farmId && isUuid(farmId) ? { farmId } : {}),
      ...(includeSimulation === 'true' ? {} : { isSimulation: false }),
    },
    include: { farm: { select: { id: true, farmCode: true, name: true, isDemo: true } } },
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

/* ───────────── Forecasts & buyers ───────────── */

function forecastFilters(q) {
  const from = q.from ? new Date(q.from) : undefined;
  const to = q.to ? new Date(q.to) : q.days ? addDays(new Date(), Number(q.days)) : undefined;
  return { from, to, district: q.district, cooperativeId: q.cooperativeId, minQuantityKg: q.minQuantityKg, grade: q.grade };
}

/** Buyers see anonymised supply: cooperative, district, dates, quantity ranges, expected grade — no farmer identity. */
const anonymise = (f) => ({
  id: f.id, cooperative: f.cooperative ? { id: f.cooperative.id, name: f.cooperative.name } : null, district: f.district,
  expectedHarvestDate: f.expectedHarvestDate, expectedQuantityKg: f.expectedQuantityKg, riskAdjustedQuantityKg: f.riskAdjustedQuantityKg,
  lowQuantityKg: f.lowQuantityKg, highQuantityKg: f.highQuantityKg, confidence: f.confidence, expectedGrade: f.expectedGrade,
  species: f.farm?.species?.commonName, isDemo: f.isDemo,
});

export async function harvestForecasts(req, res) {
  const q = req.valid.query;
  const isBuyerOnly = hasRole(req.user, ROLES.BUYER) && !hasRole(req.user, ROLES.ADMIN, ROLES.COOPERATIVE_ADMIN, ROLES.EXTENSION_OFFICER, ROLES.FARMER);
  const where = isBuyerOnly ? { farm: { status: 'ACTIVE' } } : { farm: farmScope(req.user) };
  const forecasts = await HarvestForecastService.list({ where, ...forecastFilters(q) });
  const summary = HarvestForecastService.aggregate(forecasts);
  return ok(res, { forecasts: isBuyerOnly ? forecasts.map(anonymise) : forecasts, summary });
}

export async function generateForecasts(req, res) {
  const rows = await HarvestForecastService.generate();
  await audit(req, 'GENERATE_FORECASTS', 'HarvestForecast', null, { count: rows.length });
  return ok(res, { generated: rows.length }, 'Forecasts regenerated');
}

export async function buyerForecast(req, res) {
  const q = req.valid.query;
  const forecasts = await HarvestForecastService.list({ where: { farm: { status: 'ACTIVE' } }, ...forecastFilters(q) });
  const summary = HarvestForecastService.aggregate(forecasts);
  const cooperatives = await prisma.cooperative.findMany({ select: { id: true, name: true, district: true } });
  const districts = [...new Set(forecasts.map((f) => f.district))].sort();
  let demand = [];
  if (req.user.buyerId) demand = await prisma.buyerDemand.findMany({ where: { buyerId: req.user.buyerId }, orderBy: { neededBy: 'asc' }, include: { species: { select: { commonName: true } } } });
  const qualityHistory = await prisma.harvestRecord.groupBy({ by: ['qualityGrade'], _count: { _all: true }, _sum: { actualQuantity: true }, where: { harvestDate: { gte: addDays(new Date(), -365) }, qualityGrade: { not: null } } });
  return ok(res, { summary, supply: forecasts.map(anonymise), filters: { cooperatives, districts }, demand, qualityHistory: qualityHistory.map((g) => ({ grade: g.qualityGrade, harvests: g._count._all, kg: Math.round(g._sum.actualQuantity || 0) })) });
}

export async function listBuyers(_req, res) {
  const buyers = await prisma.buyer.findMany({ select: { id: true, companyName: true, district: true, isDemo: true }, orderBy: { companyName: 'asc' } });
  return ok(res, { buyers });
}

export async function createDemand(req, res) {
  if (!req.user.buyerId) throw forbidden('Only buyer accounts can post demand');
  const d = req.valid.body;
  if (d.speciesId && !(await prisma.seaweedSpecies.findUnique({ where: { id: d.speciesId } }))) throw badRequest('Unknown species');
  const demand = await prisma.buyerDemand.create({ data: { buyerId: req.user.buyerId, ...d } });
  await audit(req, 'CREATE', 'BuyerDemand', demand.id);
  return created(res, { demand }, 'Demand posted');
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

/* ───────────── SMS / USSD simulators ───────────── */

async function assertChannelPhone(req, phone) {
  if (hasRole(req.user, ROLES.ADMIN, ROLES.EXTENSION_OFFICER, ROLES.COOPERATIVE_ADMIN)) return;
  if (!req.user.phone || req.user.phone.replace(/[^0-9+]/g, '') !== phone.replace(/[^0-9+]/g, '')) {
    throw forbidden('You can only simulate messages from your own registered phone number');
  }
}

export async function smsSimulate(req, res) {
  await assertChannelPhone(req, req.valid.body.from);
  const result = await processSms(req.valid.body);
  return ok(res, { ...result, provider: getSMSProvider().name, simulated: true });
}

export async function smsMessages(req, res) {
  const phone = String(req.query.phone || req.user.phone || '');
  if (!phone) return ok(res, { messages: [] });
  await assertChannelPhone(req, phone);
  const messages = await prisma.smsMessage.findMany({ where: { phoneNumber: phone.replace(/[^0-9+]/g, '') }, orderBy: { createdAt: 'desc' }, take: 50 });
  return ok(res, { messages: messages.reverse() });
}

export async function ussdSimulate(req, res) {
  await assertChannelPhone(req, req.valid.body.phoneNumber);
  const result = await processUssd(req.valid.body);
  return ok(res, { ...result, provider: getUSSDProvider().name, simulated: !getUSSDProvider().isLive });
}

/** Live gateway callback (Africa's Talking). Only active when USSD_PROVIDER is configured and DEMO_MODE=false. */
export async function ussdCallback(req, res) {
  const provider = getUSSDProvider();
  if (!provider.isLive) return res.status(404).type('text/plain').send('END USSD gateway not configured');
  // A shared secret is mandatory: without it anyone could submit reports as any registered phone.
  if (!env.ussd.apiKey) return res.status(503).type('text/plain').send('END USSD gateway secret not configured');
  const given = String(req.query.key || req.get('x-ussd-key') || '');
  const a = Buffer.from(given); const b = Buffer.from(env.ussd.apiKey);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).type('text/plain').send('END Unauthorized');
  const parsed = provider.parse(req.body || {});
  if (!parsed.sessionId || !parsed.phoneNumber) return res.status(400).type('text/plain').send('END Invalid request');
  const { response } = await processUssd(parsed);
  return res.type('text/plain').send(response);
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
      demoMode: env.demoMode,
      providers: { ...EnvironmentService.providerStatus(), llm: getLLMProvider().name, sms: getSMSProvider().name, ussd: getUSSDProvider().name },
      time: new Date().toISOString(),
    },
    message: database === 'ok' ? 'Healthy' : 'Database unavailable',
  });
}
