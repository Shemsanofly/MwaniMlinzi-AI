import prisma from '../config/prisma.js';
import { ok } from '../utils/response.js';
import { forbidden, notFound } from '../utils/errors.js';
import { hasRole, ROLES } from '../middleware/auth.js';
import { FarmService } from '../services/farmService.js';
import { HarvestForecastService } from '../services/harvestForecastService.js';
import { getSetting } from '../services/settingsService.js';
import { addDays } from '../utils/dates.js';
import { isUuid } from '../services/accessService.js';

const LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const RISK_TYPES = ['HEAT_ICE_ICE', 'STORM_LINE_DAMAGE', 'POOR_GROWTH', 'HARVEST_WINDOW'];
const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

function riskDistribution(farms) {
  const overall = Object.fromEntries(LEVELS.map((l) => [l, 0]));
  const byType = Object.fromEntries(RISK_TYPES.map((rt) => [rt, Object.fromEntries(LEVELS.map((l) => [l, 0]))]));
  for (const f of farms) {
    if (f.overallRiskLevel) overall[f.overallRiskLevel] += 1;
    for (const rt of RISK_TYPES) {
      const lvl = f.latestRisks?.[rt]?.level;
      if (lvl) byType[rt][lvl] += 1;
    }
  }
  return { overall: LEVELS.map((level) => ({ level, farms: overall[level] })), byType: RISK_TYPES.map((riskType) => ({ riskType, ...byType[riskType] })) };
}

function dailySeries(rows, dateField, days = 30) {
  const counts = new Map();
  for (const r of rows) counts.set(dayKey(r[dateField]), (counts.get(dayKey(r[dateField])) || 0) + 1);
  return Array.from({ length: days }, (_, i) => {
    const d = dayKey(addDays(new Date(), i - days + 1));
    return { date: d, count: counts.get(d) || 0 };
  });
}

/** Shared portfolio dashboard for a set of farms (cooperative scope or all farms). */
async function portfolio(farmWhere) {
  const farms = await FarmService.list(farmWhere, { take: 1000 });
  const ids = farms.map((f) => f.id);
  const since30 = addDays(new Date(), -30);
  const missingDays = Number(await getSetting('alerts.missingReportDays')) || 14;
  const [alerts, observations, losses, forecasts, actions] = await Promise.all([
    prisma.alert.findMany({ where: { farmId: { in: ids }, isSimulation: false, createdAt: { gte: since30 } }, orderBy: { createdAt: 'desc' }, include: { farm: { select: { id: true, farmCode: true, name: true } } } }),
    prisma.farmObservation.findMany({ where: { farmId: { in: ids }, observedAt: { gte: since30 } }, select: { observedAt: true, whitening: true, breakage: true, epiphytes: true, diseaseSymptoms: true, cropCondition: true } }),
    prisma.lossRecord.findMany({ where: { farmId: { in: ids }, lossDate: { gte: addDays(new Date(), -180) } } }),
    HarvestForecastService.list({ where: { farmId: { in: ids } } }),
    prisma.farmerAction.findMany({ where: { farmId: { in: ids }, performedAt: { gte: since30 } }, select: { performedAt: true, actionTaken: true } }),
  ]);
  const active = farms.filter((f) => f.status === 'ACTIVE');
  const missing = active.filter((f) => f.currentCycle && (!f.lastObservation || new Date(f.lastObservation.observedAt) < addDays(new Date(), -missingDays)));
  const agg = HarvestForecastService.aggregate(forecasts);
  const lossByCause = {};
  for (const l of losses) {
    lossByCause[l.cause] ||= { cause: l.cause, events: 0, avgPercent: 0, kg: 0 };
    lossByCause[l.cause].events += 1;
    lossByCause[l.cause].avgPercent += l.percentLost;
    lossByCause[l.cause].kg += l.quantityKg || 0;
  }
  Object.values(lossByCause).forEach((v) => { v.avgPercent = Math.round((v.avgPercent / v.events) * 10) / 10; v.kg = Math.round(v.kg); });
  const alertsByType = {};
  alerts.forEach((a) => { alertsByType[a.type] = (alertsByType[a.type] || 0) + 1; });
  const obsSymptoms = {
    whitening: observations.filter((o) => o.whitening).length,
    breakage: observations.filter((o) => o.breakage).length,
    epiphytes: observations.filter((o) => o.epiphytes).length,
    poorCondition: observations.filter((o) => o.cropCondition === 'POOR').length,
    total: observations.length,
  };
  const highRisk = farms.filter((f) => ['HIGH', 'CRITICAL'].includes(f.overallRiskLevel));
  return {
    farms,
    cards: {
      totalFarmers: new Set(farms.map((f) => f.farmer?.id).filter(Boolean)).size,
      activeFarms: active.length,
      highRiskFarms: highRisk.length,
      criticalAlerts: alerts.filter((a) => a.severity === 'CRITICAL' && a.status === 'ACTIVE').length,
      activeAlerts: alerts.filter((a) => a.status === 'ACTIVE').length,
      expectedHarvestKg30d: agg.horizons.next30Days.riskAdjustedKg,
      expectedHarvestRange30d: [agg.horizons.next30Days.lowKg, agg.horizons.next30Days.highKg],
      missingReports: missing.length,
    },
    charts: {
      riskDistribution: riskDistribution(farms),
      harvestForecast: agg.byWeek,
      farmActivity: dailySeries(observations, 'observedAt').map((d, i) => ({ ...d, actions: dailySeries(actions, 'performedAt')[i].count })),
      losses: Object.values(lossByCause),
      alertsByType: Object.entries(alertsByType).map(([type, count]) => ({ type, count })),
      observations: obsSymptoms,
    },
    forecastSummary: agg,
    highRiskFarms: highRisk.sort((a, b) => LEVELS.indexOf(b.overallRiskLevel) - LEVELS.indexOf(a.overallRiskLevel)).slice(0, 20),
    recentAlerts: alerts.slice(0, 20),
    missingReportFarms: missing.map((f) => ({ id: f.id, farmCode: f.farmCode, name: f.name, farmer: f.farmer?.fullName, lastObservation: f.lastObservation?.observedAt || null })),
  };
}

export async function cooperativeDashboard(req, res) {
  const { id } = req.params;
  if (!isUuid(id)) throw notFound('Cooperative');
  const coop = await prisma.cooperative.findUnique({ where: { id } });
  if (!coop) throw notFound('Cooperative');
  const allowed = hasRole(req.user, ROLES.ADMIN, ROLES.EXTENSION_OFFICER) || (hasRole(req.user, ROLES.COOPERATIVE_ADMIN) && req.user.cooperativeId === id);
  if (!allowed) throw forbidden('You can only view your own cooperative');
  const members = await prisma.cooperativeMember.count({ where: { cooperativeId: id, isActive: true } });
  const data = await portfolio({ cooperativeId: id });
  // Farm performance: yield vs estimate per farm from harvest records.
  const harvests = await prisma.harvestRecord.findMany({ where: { farm: { cooperativeId: id } }, include: { farm: { select: { farmCode: true, name: true } } }, orderBy: { harvestDate: 'desc' }, take: 200 });
  const perf = {};
  for (const h of harvests) {
    perf[h.farmId] ||= { farmId: h.farmId, farmCode: h.farm.farmCode, name: h.farm.name, harvests: 0, totalKg: 0, avgLossPercent: 0, lossSamples: 0 };
    const p = perf[h.farmId];
    p.harvests += 1;
    p.totalKg += h.actualQuantity;
    if (h.lossPercent != null) { p.avgLossPercent += h.lossPercent; p.lossSamples += 1; }
  }
  const performance = Object.values(perf).map((p) => ({ ...p, totalKg: Math.round(p.totalKg), avgLossPercent: p.lossSamples ? Math.round((p.avgLossPercent / p.lossSamples) * 10) / 10 : null })).sort((a, b) => b.totalKg - a.totalKg);
  const outcomes = await prisma.actionOutcome.findMany({ where: { farm: { cooperativeId: id } }, orderBy: { outcomeDate: 'desc' }, take: 30, include: { farm: { select: { farmCode: true } }, prediction: { select: { riskType: true, riskLevel: true } } } });
  return ok(res, { cooperative: coop, members, ...data, cards: { ...data.cards, totalFarmers: members }, performance, outcomes });
}

export async function myCooperativeDashboard(req, res) {
  let coopId = req.user.cooperativeId;
  // Admins / extension officers without a cooperative get the first one (or ?cooperativeId=) so the view is usable.
  if (!coopId && hasRole(req.user, ROLES.ADMIN, ROLES.EXTENSION_OFFICER)) {
    coopId = isUuid(req.query.cooperativeId) ? req.query.cooperativeId : (await prisma.cooperative.findFirst({ orderBy: { name: 'asc' }, select: { id: true } }))?.id;
  }
  if (!coopId) throw forbidden('Your account is not linked to a cooperative');
  req.params.id = coopId;
  return cooperativeDashboard(req, res);
}

export async function listCooperatives(req, res) {
  let where;
  if (hasRole(req.user, ROLES.ADMIN, ROLES.EXTENSION_OFFICER, ROLES.BUYER)) where = {};
  else if (req.user.cooperativeId) where = { id: req.user.cooperativeId };
  else if (req.user.farmerId) where = { members: { some: { farmerId: req.user.farmerId } } };
  else where = { id: '00000000-0000-0000-0000-000000000000' };
  const cooperatives = await prisma.cooperative.findMany({ where, include: { _count: { select: { members: true, farms: true } } }, orderBy: { name: 'asc' } });
  return ok(res, { cooperatives });
}

export async function cooperativeFarmers(req, res) {
  const { id } = req.params;
  if (!isUuid(id)) throw notFound('Cooperative');
  const allowed = hasRole(req.user, ROLES.ADMIN, ROLES.EXTENSION_OFFICER) || (hasRole(req.user, ROLES.COOPERATIVE_ADMIN) && req.user.cooperativeId === id);
  if (!allowed) throw forbidden();
  const members = await prisma.cooperativeMember.findMany({
    where: { cooperativeId: id },
    include: { farmer: { include: { user: { select: { fullName: true, phone: true, email: true, isDemo: true } }, farms: { select: { id: true, farmCode: true, name: true, status: true } } } } },
    orderBy: { joinedAt: 'asc' },
  });
  return ok(res, { farmers: members.map((m) => ({ id: m.farmer.id, farmerCode: m.farmer.farmerCode, fullName: m.farmer.user.fullName, phone: m.farmer.user.phone, village: m.farmer.village, district: m.farmer.district, isDemo: m.farmer.user.isDemo, joinedAt: m.joinedAt, farms: m.farmer.farms })) });
}

export async function extensionDashboard(_req, res) {
  const data = await portfolio({});
  const [pendingObservations, diseaseObservations, pendingRecs, notes] = await Promise.all([
    prisma.farmObservation.findMany({ where: { reviewStatus: 'PENDING' }, orderBy: { observedAt: 'desc' }, take: 30, include: { farm: { select: { id: true, farmCode: true, name: true } }, reporter: { select: { fullName: true } }, image: { select: { id: true } } } }),
    prisma.diseaseObservation.findMany({ orderBy: { createdAt: 'desc' }, take: 20, include: { farm: { select: { id: true, farmCode: true, name: true } } } }),
    prisma.actionRecommendation.findMany({ where: { reviewStatus: 'PENDING', isSimulation: false, status: { in: ['PENDING', 'ACKNOWLEDGED'] }, prediction: { riskLevel: { in: ['HIGH', 'CRITICAL'] } } }, orderBy: { createdAt: 'desc' }, take: 30, include: { actionLibrary: true, farm: { select: { id: true, farmCode: true, name: true } }, prediction: { select: { id: true, riskType: true, riskLevel: true, probability: true, explanation: true, explanationSw: true } } } }),
    prisma.extensionNote.findMany({ orderBy: { createdAt: 'desc' }, take: 200, select: { farmId: true, createdAt: true } }),
  ]);
  const lastVisit = {};
  notes.forEach((n) => { if (!lastVisit[n.farmId]) lastVisit[n.farmId] = n.createdAt; });
  const pendingByFarm = {};
  pendingObservations.forEach((o) => { pendingByFarm[o.farmId] = (pendingByFarm[o.farmId] || 0) + 1; });
  // Visit priority: highest risk probability, unreviewed reports and time since the last officer note.
  const visitPriority = data.farms.filter((f) => f.status === 'ACTIVE').map((f) => {
    const maxProb = Math.max(0, ...['HEAT_ICE_ICE', 'STORM_LINE_DAMAGE', 'POOR_GROWTH'].map((rt) => f.latestRisks?.[rt]?.probability ?? 0));
    const daysSinceVisit = lastVisit[f.id] ? Math.floor((Date.now() - new Date(lastVisit[f.id])) / 86400000) : 30;
    const score = Math.round((maxProb * 70 + Math.min(pendingByFarm[f.id] || 0, 3) * 5 + Math.min(daysSinceVisit, 30) / 2) * 10) / 10;
    return { id: f.id, farmCode: f.farmCode, name: f.name, farmer: f.farmer?.fullName, overallRiskLevel: f.overallRiskLevel, maxProbability: maxProb, pendingReports: pendingByFarm[f.id] || 0, daysSinceVisit: lastVisit[f.id] ? daysSinceVisit : null, score, location: f.location };
  }).sort((a, b) => b.score - a.score).slice(0, 15);
  return ok(res, {
    ...data,
    pendingObservations,
    diseaseObservations,
    pendingRecommendations: pendingRecs.map((r) => ({ id: r.id, status: r.status, reviewStatus: r.reviewStatus, createdAt: r.createdAt, farm: r.farm, prediction: r.prediction, action: r.actionLibrary.action, actionSw: r.actionLibrary.actionSw, validated: r.actionLibrary.validated, actionLibraryId: r.actionLibraryId })),
    visitPriority,
  });
}

export async function extensionObservations(req, res) {
  const status = req.query.reviewStatus ? String(req.query.reviewStatus) : undefined;
  const observations = await prisma.farmObservation.findMany({
    where: { ...(status ? { reviewStatus: status } : {}) },
    orderBy: { observedAt: 'desc' },
    take: 100,
    include: { farm: { select: { id: true, farmCode: true, name: true } }, reporter: { select: { fullName: true } }, reviewedBy: { select: { fullName: true } }, image: { select: { id: true } } },
  });
  return ok(res, { observations });
}

export async function reviewObservation(req, res) {
  const obs = await prisma.farmObservation.findUnique({ where: { id: req.params.id } });
  if (!obs) throw notFound('Observation');
  const updated = await prisma.farmObservation.update({ where: { id: obs.id }, data: { reviewStatus: req.valid.body.status, reviewNote: req.valid.body.note || null, reviewedById: req.user.id, reviewedAt: new Date() } });
  await prisma.auditLog.create({ data: { userId: req.user.id, action: 'REVIEW', entityType: 'FarmObservation', entityId: obs.id, details: req.valid.body, ipAddress: req.ip } });
  return ok(res, { observation: updated }, 'Observation reviewed');
}

export async function extensionRecommendations(req, res) {
  const status = req.query.reviewStatus ? String(req.query.reviewStatus) : undefined;
  const recs = await prisma.actionRecommendation.findMany({
    where: { isSimulation: false, ...(status ? { reviewStatus: status } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { actionLibrary: true, farm: { select: { id: true, farmCode: true, name: true } }, prediction: { select: { id: true, riskType: true, riskLevel: true, probability: true, explanation: true, explanationSw: true, flagged: true } }, reviewedBy: { select: { fullName: true } } },
  });
  return ok(res, { recommendations: recs });
}

export async function reviewRecommendation(req, res) {
  const rec = await prisma.actionRecommendation.findUnique({ where: { id: req.params.id } });
  if (!rec) throw notFound('Recommendation');
  const updated = await prisma.actionRecommendation.update({ where: { id: rec.id }, data: { reviewStatus: req.valid.body.status, reviewNote: req.valid.body.note || null, reviewedById: req.user.id, reviewedAt: new Date() } });
  await prisma.auditLog.create({ data: { userId: req.user.id, action: 'REVIEW', entityType: 'ActionRecommendation', entityId: rec.id, details: req.valid.body, ipAddress: req.ip } });
  return ok(res, { recommendation: updated }, 'Recommendation reviewed');
}

export async function adminDashboard(_req, res) {
  const since24 = addDays(new Date(), -1);
  const [users, roles, farms, activeFarms, predictions, predictions24h, simulations, alertsActive, models, actions, validatedActions, jobs, observations, harvests, outcomes, feedback] = await Promise.all([
    prisma.user.count(),
    prisma.role.findMany({ include: { _count: { select: { users: true } } } }),
    prisma.farm.count(),
    prisma.farm.count({ where: { status: 'ACTIVE' } }),
    prisma.riskPrediction.count({ where: { isSimulation: false } }),
    prisma.riskPrediction.count({ where: { isSimulation: false, createdAt: { gte: since24 } } }),
    prisma.riskPrediction.count({ where: { isSimulation: true } }),
    prisma.alert.count({ where: { status: 'ACTIVE', isSimulation: false } }),
    prisma.mlModel.findMany({ orderBy: { trainedAt: 'desc' }, include: { metrics: { where: { dataset: 'TEST' } } } }),
    prisma.actionLibrary.count(),
    prisma.actionLibrary.count({ where: { validated: true } }),
    prisma.jobRun.findMany({ orderBy: { startedAt: 'desc' }, take: 10 }),
    prisma.farmObservation.count(),
    prisma.harvestRecord.count(),
    prisma.actionOutcome.count(),
    prisma.modelFeedback.groupBy({ by: ['feedbackType'], _count: { _all: true } }),
  ]);
  const predictionsByLevel = await prisma.riskPrediction.groupBy({ by: ['riskLevel'], where: { isSimulation: false, createdAt: { gte: addDays(new Date(), -7) } }, _count: { _all: true } });
  return ok(res, {
    counts: { users, farms, activeFarms, predictions, predictions24h, simulations, alertsActive, actions, validatedActions, observations, harvests, outcomes },
    usersByRole: roles.map((r) => ({ role: r.name, users: r._count.users })),
    predictionsByLevel: predictionsByLevel.map((p) => ({ level: p.riskLevel, count: p._count._all })),
    feedback: feedback.map((f) => ({ type: f.feedbackType, count: f._count._all })),
    models: models.map((m) => ({ id: m.id, name: m.name, version: m.version, riskType: m.riskType, status: m.status, trainedAt: m.trainedAt, syntheticData: m.syntheticData, metrics: Object.fromEntries(m.metrics.map((x) => [x.metric, x.value])) })),
    recentJobs: jobs,
  });
}
