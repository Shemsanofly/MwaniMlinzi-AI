import { farmRecords } from '../db/records.js';
import prisma from '../config/prisma.js';
import { ok } from '../utils/response.js';
import { AppError } from '../utils/errors.js';
import { PublicAccessService } from '../services/publicAccessService.js';
import { HarvestForecastService } from '../services/harvestForecastService.js';
import { addDays } from '../utils/dates.js';

/** Read the token from `Authorization: Bearer …`, `?token=…`, or the `X-Access-Token` header. */
function readToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  if (req.headers['x-access-token']) return String(req.headers['x-access-token']).trim();
  if (req.query.token) return String(req.query.token).trim();
  return null;
}

async function requireToken(req, scope) {
  const row = await PublicAccessService.authenticate(readToken(req), scope);
  if (!row) throw new AppError('INVALID_TOKEN', 'Invalid, revoked, expired or wrong-scope access token', 401);
  return row;
}

/** GET /api/public/forecasts — processors/buyers see cooperative-level 7/14/30-day totals with uncertainty ranges. */
export async function forecasts(req, res) {
  const token = await requireToken(req, 'FORECASTS');
  const cooperativeId = token.cooperativeId;
  const forecastRows = await HarvestForecastService.list(cooperativeId ? { cooperativeId } : {});
  const agg = HarvestForecastService.aggregate(forecastRows);
  return ok(res, {
    cooperative: token.cooperative ? { code: token.cooperative.code, name: token.cooperative.name, district: token.cooperative.district } : null,
    generatedAt: new Date().toISOString(),
    horizons: agg.horizons,          // next7Days / next14Days / next30Days with riskAdjustedKg + low/high
    weekly: agg.byWeek,              // weekly expected harvest curve
    note: 'Aggregated cooperative-level forecasts with uncertainty ranges. No farmer-identifying data.',
  });
}

/** GET /api/public/adoption — programmes/NGOs see cooperative adoption and outcome metrics. */
export async function adoption(req, res) {
  const token = await requireToken(req, 'ADOPTION');
  const cooperativeId = token.cooperativeId;
  const since = addDays(new Date(), -90);
  const farmWhere = cooperativeId ? { cooperativeId } : {};

  const [farmerCount, activeFarmCount, alerts, actions, outcomes, observations] = await Promise.all([
    prisma.farmer.count(cooperativeId ? { where: { memberships: { some: { cooperativeId, isActive: true } } } } : {}),
    prisma.farm.count({ where: { ...farmWhere, status: 'ACTIVE' } }),
    prisma.alert.findMany({
      where: { farm: farmWhere, isSimulation: false, createdAt: { gte: since } },
      select: { severity: true, status: true, acknowledgedAt: true, createdAt: true },
    }),
    prisma.farmerAction.findMany({
      where: { farm: farmWhere, performedAt: { gte: since } },
      select: { performedAt: true, actionTaken: true },
    }),
    farmRecords(prisma, 'OUTCOME').count({ where: { farm: farmWhere, outcomeDate: { gte: since } } }),
    prisma.farmObservation.count({ where: { farm: farmWhere, observedAt: { gte: since } } }),
  ]);

  const highAlerts = alerts.filter((a) => ['HIGH', 'CRITICAL'].includes(a.severity));
  const acknowledged = highAlerts.filter((a) => a.acknowledgedAt).length;
  const ackWithin48h = highAlerts.filter((a) => a.acknowledgedAt && (a.acknowledgedAt - a.createdAt) <= 48 * 3600 * 1000).length;

  return ok(res, {
    cooperative: token.cooperative ? { code: token.cooperative.code, name: token.cooperative.name, district: token.cooperative.district } : null,
    generatedAt: new Date().toISOString(),
    window: { days: 90 },
    adoption: {
      farmersRegistered: farmerCount,
      activeFarms: activeFarmCount,
      observationsRecorded: observations,
      actionsTaken: actions.length,
      outcomesRecorded: outcomes,
    },
    alerts: {
      highOrCriticalIssued: highAlerts.length,
      acknowledged,
      acknowledgedWithin48h: ackWithin48h,
      acknowledgementRate: highAlerts.length ? Math.round((acknowledged / highAlerts.length) * 100) / 100 : null,
      actionWithin48hRate: highAlerts.length ? Math.round((ackWithin48h / highAlerts.length) * 100) / 100 : null,
    },
    note: 'Cooperative-level adoption and outcome metrics for the last 90 days. No farmer-identifying data.',
  });
}
