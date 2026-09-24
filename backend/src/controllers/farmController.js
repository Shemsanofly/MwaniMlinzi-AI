import prisma from '../config/prisma.js';
import { ok, created } from '../utils/response.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { audit } from '../utils/audit.js';
import { hasRole, ROLES } from '../middleware/auth.js';
import { assertFarmAccess, farmScope, isUuid } from '../services/accessService.js';
import { FarmService } from '../services/farmService.js';
import { RecordService } from '../services/recordService.js';
import { RiskService, serializePrediction, serializeRecommendation } from '../services/riskService.js';
import { EnvironmentService } from '../services/environmentService.js';
import { HarvestForecastService } from '../services/harvestForecastService.js';
import { pageParams } from '../utils/pagination.js';

const farmId = (req) => {
  if (!isUuid(req.params.id)) throw notFound('Farm');
  return req.params.id;
};

export async function listFarms(req, res) {
  const { status, cooperativeId, district, riskLevel, search } = req.query;
  const where = {
    AND: [
      farmScope(req.user),
      status ? { status: String(status) } : {},
      cooperativeId && isUuid(cooperativeId) ? { cooperativeId } : {},
      district ? { location: { is: { district: String(district) } } } : {},
      search ? { OR: [{ name: { contains: String(search), mode: 'insensitive' } }, { farmCode: { contains: String(search), mode: 'insensitive' } }] } : {},
    ],
  };
  let farms = await FarmService.list(where, { take: 500 });
  if (riskLevel) farms = farms.filter((f) => f.overallRiskLevel === riskLevel);
  return ok(res, { farms, count: farms.length });
}

export async function getFarm(req, res) {
  const id = farmId(req);
  await assertFarmAccess(req.user, id);
  return ok(res, { farm: await FarmService.get(id) });
}

export async function createFarm(req, res) {
  let targetFarmerId = req.user.farmerId;
  if (hasRole(req.user, ROLES.ADMIN, ROLES.EXTENSION_OFFICER) && req.body.farmerId) {
    if (!isUuid(req.body.farmerId) || !(await prisma.farmer.findUnique({ where: { id: req.body.farmerId } }))) throw badRequest('Unknown farmer');
    targetFarmerId = req.body.farmerId;
  }
  if (!targetFarmerId) throw forbidden('Only farmers can create farms (admins must specify farmerId)');
  const farm = await FarmService.create(targetFarmerId, req.valid.body);
  await audit(req, 'CREATE', 'Farm', farm.id, { farmCode: farm.farmCode });
  // Give the new farm an initial assessment and forecast straight away.
  if (farm.currentCycle) {
    await RiskService.runForFarm(farm.id, { trigger: 'MANUAL' }).catch((err) => console.warn('[farm] initial risk run failed:', err.message));
    await HarvestForecastService.generate({ farmId: farm.id }).catch(() => null);
  }
  return created(res, { farm: await FarmService.get(farm.id) }, 'Farm created');
}

export async function updateFarm(req, res) {
  const id = farmId(req);
  await assertFarmAccess(req.user, id, { write: true });
  const farm = await FarmService.update(id, req.valid.body);
  await audit(req, 'UPDATE', 'Farm', id, { fields: Object.keys(req.valid.body) });
  return ok(res, { farm }, 'Farm updated');
}

export async function listCycles(req, res) {
  const id = farmId(req);
  await assertFarmAccess(req.user, id);
  const cycles = await prisma.plantingCycle.findMany({ where: { farmId: id }, orderBy: { plantingDate: 'desc' } });
  return ok(res, { cycles });
}

export async function createCycle(req, res) {
  const id = farmId(req);
  await assertFarmAccess(req.user, id, { write: true });
  const cycle = await FarmService.startCycle(id, req.valid.body);
  await audit(req, 'CREATE', 'PlantingCycle', cycle.id, { farmId: id });
  await RiskService.runForFarm(id, { trigger: 'MANUAL' }).catch(() => null);
  await HarvestForecastService.generate({ farmId: id }).catch(() => null);
  return created(res, { cycle }, 'Planting recorded');
}

export async function updateCycle(req, res) {
  const id = farmId(req);
  await assertFarmAccess(req.user, id, { write: true });
  const cycle = await prisma.plantingCycle.findUnique({ where: { id: req.params.cycleId } });
  if (!cycle || cycle.farmId !== id) throw notFound('Planting cycle');
  const updated = await prisma.plantingCycle.update({ where: { id: cycle.id }, data: req.valid.body });
  await audit(req, 'UPDATE', 'PlantingCycle', cycle.id, req.valid.body);
  return ok(res, { cycle: updated });
}

export async function listObservations(req, res) {
  const id = farmId(req);
  await assertFarmAccess(req.user, id);
  const { take, skip } = pageParams(req.query);
  const observations = await prisma.farmObservation.findMany({
    where: { farmId: id },
    orderBy: { observedAt: 'desc' },
    take,
    skip,
    include: { reporter: { select: { fullName: true } }, reviewedBy: { select: { fullName: true } }, image: { select: { id: true, mimeType: true } }, diseases: true },
  });
  return ok(res, { observations });
}

export async function createObservation(req, res) {
  const id = farmId(req);
  await assertFarmAccess(req.user, id, { write: true });
  const { observation, risk } = await RecordService.createObservation(id, req.user, req.valid.body, { channel: hasRole(req.user, ROLES.EXTENSION_OFFICER) && req.user.farmerId == null ? 'EXTENSION' : 'APP' });
  await audit(req, 'CREATE', 'FarmObservation', observation.id, { farmId: id });
  return created(res, { observation, risk }, 'Observation recorded');
}

export async function listHarvests(req, res) {
  const id = farmId(req);
  await assertFarmAccess(req.user, id);
  const harvests = await prisma.harvestRecord.findMany({ where: { farmId: id }, orderBy: { harvestDate: 'desc' }, include: { quality: true, drying: true, buyer: { select: { id: true, companyName: true } } } });
  return ok(res, { harvests });
}

export async function createHarvest(req, res) {
  const id = farmId(req);
  await assertFarmAccess(req.user, id, { write: true });
  const harvest = await RecordService.createHarvest(id, req.valid.body);
  await audit(req, 'CREATE', 'HarvestRecord', harvest.id, { farmId: id, actualQuantity: harvest.actualQuantity });
  return created(res, { harvest }, 'Harvest recorded');
}

export async function listLosses(req, res) {
  const id = farmId(req);
  await assertFarmAccess(req.user, id);
  const losses = await prisma.lossRecord.findMany({ where: { farmId: id }, orderBy: { lossDate: 'desc' } });
  return ok(res, { losses });
}

export async function createLoss(req, res) {
  const id = farmId(req);
  await assertFarmAccess(req.user, id, { write: true });
  const loss = await RecordService.createLoss(id, req.valid.body);
  await audit(req, 'CREATE', 'LossRecord', loss.id, { farmId: id, cause: loss.cause, percentLost: loss.percentLost });
  return created(res, { loss }, 'Loss recorded');
}

export async function getRisks(req, res) {
  const id = farmId(req);
  await assertFarmAccess(req.user, id);
  let risk = await RiskService.latestForFarm(id);
  if (!risk.predictions.length) risk = await RiskService.runForFarm(id, { trigger: 'MANUAL' });
  return ok(res, risk);
}

export async function runRisks(req, res) {
  const id = farmId(req);
  await assertFarmAccess(req.user, id);
  const result = await RiskService.runForFarm(id, { trigger: 'MANUAL' });
  await audit(req, 'RUN_RISK', 'Farm', id);
  return ok(res, result, 'Risk recalculated');
}

export async function riskHistory(req, res) {
  const id = farmId(req);
  await assertFarmAccess(req.user, id);
  const days = Math.min(Number(req.query.days) || 30, 365);
  const predictions = await prisma.riskPrediction.findMany({
    where: { farmId: id, isSimulation: false, createdAt: { gte: new Date(Date.now() - days * 86400000) }, ...(req.query.riskType ? { riskType: String(req.query.riskType) } : {}) },
    orderBy: { createdAt: 'asc' },
    select: { id: true, riskType: true, probability: true, riskLevel: true, confidence: true, modelType: true, createdAt: true, trigger: true },
  });
  return ok(res, { predictions });
}

export async function listRecommendations(req, res) {
  const id = farmId(req);
  await assertFarmAccess(req.user, id);
  const status = req.query.status ? String(req.query.status).split(',') : undefined;
  const recs = await prisma.actionRecommendation.findMany({
    where: { farmId: id, isSimulation: false, ...(status ? { status: { in: status } } : {}) },
    include: { actionLibrary: true, prediction: { select: { riskLevel: true, probability: true, riskType: true, createdAt: true } }, farmerActions: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return ok(res, { recommendations: recs.map((r) => ({ ...serializeRecommendation(r), prediction: r.prediction, farmerActions: r.farmerActions })) });
}

export async function updateRecommendation(req, res) {
  const id = farmId(req);
  await assertFarmAccess(req.user, id, { write: true });
  const rec = await prisma.actionRecommendation.findUnique({ where: { id: req.params.recId } });
  if (!rec || rec.farmId !== id) throw notFound('Recommendation');
  const updated = await prisma.actionRecommendation.update({ where: { id: rec.id }, data: { status: req.valid.body.status }, include: { actionLibrary: true } });
  await audit(req, 'UPDATE', 'ActionRecommendation', rec.id, req.valid.body);
  return ok(res, { recommendation: serializeRecommendation(updated) });
}

export async function listActions(req, res) {
  const id = farmId(req);
  await assertFarmAccess(req.user, id);
  const actions = await prisma.farmerAction.findMany({ where: { farmId: id }, orderBy: { performedAt: 'desc' }, include: { recommendation: { include: { actionLibrary: true } }, outcomes: true } });
  return ok(res, { actions });
}

export async function createAction(req, res) {
  const id = farmId(req);
  await assertFarmAccess(req.user, id, { write: true });
  const action = await RecordService.recordAction(id, req.user, req.valid.body);
  await audit(req, 'CREATE', 'FarmerAction', action.id, { farmId: id, actionTaken: action.actionTaken });
  return created(res, { action }, 'Action recorded');
}

export async function listOutcomes(req, res) {
  const id = farmId(req);
  await assertFarmAccess(req.user, id);
  const outcomes = await prisma.actionOutcome.findMany({ where: { farmId: id }, orderBy: { outcomeDate: 'desc' }, include: { prediction: { select: { riskType: true, riskLevel: true, probability: true } }, farmerAction: true, recommendation: { include: { actionLibrary: { select: { action: true, actionSw: true } } } } } });
  return ok(res, { outcomes });
}

export async function createOutcome(req, res) {
  const id = farmId(req);
  await assertFarmAccess(req.user, id, { write: true });
  const result = await RecordService.recordOutcome(id, req.user, req.valid.body);
  await audit(req, 'CREATE', 'ActionOutcome', result.outcome.id, { farmId: id, outcomeType: result.outcome.outcomeType });
  return created(res, result, 'Outcome recorded');
}

/** Unified timeline for the farmer history page. */
export async function farmHistoryTimeline(req, res) {
  const id = farmId(req);
  await assertFarmAccess(req.user, id);
  const [obs, harvests, losses, actions, outcomes, alerts, cycles, preds] = await Promise.all([
    prisma.farmObservation.findMany({ where: { farmId: id }, orderBy: { observedAt: 'desc' }, take: 50 }),
    prisma.harvestRecord.findMany({ where: { farmId: id }, orderBy: { harvestDate: 'desc' }, take: 20 }),
    prisma.lossRecord.findMany({ where: { farmId: id }, orderBy: { lossDate: 'desc' }, take: 20 }),
    prisma.farmerAction.findMany({ where: { farmId: id }, orderBy: { performedAt: 'desc' }, take: 50, include: { recommendation: { select: { actionLibrary: { select: { action: true, actionSw: true } } } } } }),
    prisma.actionOutcome.findMany({ where: { farmId: id }, orderBy: { outcomeDate: 'desc' }, take: 50 }),
    prisma.alert.findMany({ where: { farmId: id, isSimulation: false }, orderBy: { createdAt: 'desc' }, take: 30 }),
    prisma.plantingCycle.findMany({ where: { farmId: id }, orderBy: { plantingDate: 'desc' } }),
    prisma.riskPrediction.findMany({ where: { farmId: id, isSimulation: false, riskLevel: { in: ['HIGH', 'CRITICAL'] } }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);
  const events = [
    ...obs.map((o) => ({ type: 'OBSERVATION', date: o.observedAt, id: o.id, data: o })),
    ...harvests.map((h) => ({ type: 'HARVEST', date: h.harvestDate, id: h.id, data: h })),
    ...losses.map((l) => ({ type: 'LOSS', date: l.lossDate, id: l.id, data: l })),
    ...actions.map(({ recommendation, ...a }) => ({
      type: 'ACTION', date: a.performedAt, id: a.id,
      // Library actions are bilingual; free-text descriptions stay as written.
      data: { ...a, descriptionSw: recommendation?.actionLibrary && a.description === recommendation.actionLibrary.action ? recommendation.actionLibrary.actionSw : a.description },
    })),
    ...outcomes.map((o) => ({ type: 'OUTCOME', date: o.outcomeDate, id: o.id, data: o })),
    ...alerts.map((a) => ({ type: 'ALERT', date: a.createdAt, id: a.id, data: a })),
    ...cycles.map((c) => ({ type: 'PLANTING', date: c.plantingDate, id: c.id, data: c })),
    ...preds.map((p) => ({ type: 'PREDICTION', date: p.createdAt, id: p.id, data: { riskType: p.riskType, riskLevel: p.riskLevel, probability: p.probability, explanation: p.explanation, explanationSw: p.explanationSw } })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));
  return ok(res, { events });
}

export async function farmEnvironment(req, res) {
  const id = farmId(req);
  await assertFarmAccess(req.user, id);
  const farm = await prisma.farm.findUnique({ where: { id }, include: { location: true } });
  const current = await EnvironmentService.currentForFarm(farm);
  const history = await EnvironmentService.history(id, Math.min(Number(req.query.days) || 14, 90));
  return ok(res, { current, history, providers: EnvironmentService.providerStatus() });
}

export async function farmAlerts(req, res) {
  const id = farmId(req);
  await assertFarmAccess(req.user, id);
  const alerts = await prisma.alert.findMany({ where: { farmId: id, ...(req.query.includeSimulation === 'true' ? {} : { isSimulation: false }) }, orderBy: { createdAt: 'desc' }, take: 50 });
  return ok(res, { alerts });
}

export async function listNotes(req, res) {
  const id = farmId(req);
  await assertFarmAccess(req.user, id);
  const notes = await prisma.extensionNote.findMany({ where: { farmId: id }, orderBy: { createdAt: 'desc' }, include: { author: { select: { fullName: true } } } });
  return ok(res, { notes });
}

export async function createNote(req, res) {
  const id = farmId(req);
  await assertFarmAccess(req.user, id);
  const note = await prisma.extensionNote.create({ data: { farmId: id, authorId: req.user.id, ...req.valid.body }, include: { author: { select: { fullName: true } } } });
  await audit(req, 'CREATE', 'ExtensionNote', note.id, { farmId: id });
  return created(res, { note }, 'Note added');
}

export async function latestPrediction(req, res) {
  const p = await prisma.riskPrediction.findUnique({ where: { id: req.params.predictionId }, include: { factors: true, recommendations: { include: { actionLibrary: true } } } });
  if (!p) throw notFound('Prediction');
  await assertFarmAccess(req.user, p.farmId);
  return ok(res, { prediction: serializePrediction(p) });
}
