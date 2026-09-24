import prisma from '../config/prisma.js';
import { EnvironmentService } from '../services/environmentService.js';
import { RiskService } from '../services/riskService.js';
import { AlertService } from '../services/alertService.js';
import { HarvestForecastService } from '../services/harvestForecastService.js';
import { ModelMonitoringService } from '../services/modelMonitoringService.js';
import { UssdService } from '../services/ussdService.js';

const activeFarms = () => prisma.farm.findMany({ where: { status: 'ACTIVE' }, include: { location: true } });

/** Job definitions. Each returns a JSON summary stored in `job_runs`. */
export const JOBS = {
  'fetch-environment': {
    schedule: '0 */6 * * *',
    description: 'Fetch weather + ocean data for every active farm (LIVE → CACHED → DEMO)',
    async run() {
      const farms = await activeFarms();
      const sources = { LIVE: 0, CACHED: 0, DEMO: 0 };
      let failed = 0;
      for (const farm of farms) {
        try {
          const env = await EnvironmentService.refreshForFarm(farm);
          if (env) sources[env.source] += 1;
        } catch { failed += 1; }
      }
      return { farms: farms.length, sources, failed };
    },
  },
  'run-risk-predictions': {
    schedule: '15 */6 * * *',
    description: 'Calculate features, run the risk engine, select actions and generate alerts for every active farm',
    async run() {
      const farms = await activeFarms();
      let alerts = 0; let failed = 0;
      const levels = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
      for (const farm of farms) {
        try {
          const r = await RiskService.runForFarm(farm.id, { trigger: 'SCHEDULED', refreshEnvironment: false });
          alerts += r.alerts.length;
          r.predictions.forEach((p) => { if (p.riskType !== 'HARVEST_WINDOW') levels[p.riskLevel] += 1; });
        } catch (err) { failed += 1; console.warn('[job] risk failed for', farm.farmCode, err.message); }
      }
      return { farms: farms.length, alertsCreated: alerts, levels, failed };
    },
  },
  'missing-reports': {
    schedule: '0 6 * * *',
    description: 'Alert on active farms with no recent observation',
    async run() {
      const created = await AlertService.checkMissingReports();
      return { alertsCreated: created.length };
    },
  },
  'harvest-forecasts': {
    schedule: '30 */6 * * *',
    description: 'Regenerate risk-adjusted harvest forecasts',
    async run() {
      const rows = await HarvestForecastService.generate();
      return { forecasts: rows.length, totalRiskAdjustedKg: Math.round(rows.reduce((s, r) => s + r.riskAdjustedQuantityKg, 0)) };
    },
  },
  'expire-ussd-sessions': {
    schedule: '*/10 * * * *',
    description: 'Mark USSD sessions inactive for more than 5 minutes as EXPIRED',
    async run() { return { expired: await UssdService.expireStale() }; },
  },
  'model-monitoring': {
    schedule: '0 2 * * *',
    description: 'Compute field metrics (precision/recall/F1) from recorded outcomes and feedback',
    async run() { return ModelMonitoringService.computeFieldMetrics(); },
  },
};

const running = new Set();

export async function runJob(name, trigger = 'MANUAL') {
  const job = JOBS[name];
  if (!job) throw new Error(`Unknown job ${name}`);
  if (running.has(name)) return { skipped: true, reason: 'Job is already running' };
  running.add(name);
  let row = null;
  try {
    row = await prisma.jobRun.create({ data: { jobName: name, trigger, status: 'RUNNING' } });
    const summary = await job.run();
    return await prisma.jobRun.update({ where: { id: row.id }, data: { status: 'SUCCESS', finishedAt: new Date(), summary } });
  } catch (err) {
    if (row) await prisma.jobRun.update({ where: { id: row.id }, data: { status: 'FAILED', finishedAt: new Date(), error: err.message } }).catch(() => {});
    throw err;
  } finally {
    running.delete(name);
  }
}
