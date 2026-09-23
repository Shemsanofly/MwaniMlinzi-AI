import prisma from '../config/prisma.js';
import { levelRank, RISK_LABELS, LEVEL_LABELS } from '../ai/constants.js';
import { getSetting } from './settingsService.js';
import { NotificationService } from './notificationService.js';

const TYPE_FOR = {
  HEAT_ICE_ICE: { HIGH: 'HEAT_HIGH', CRITICAL: 'HEAT_CRITICAL' },
  STORM_LINE_DAMAGE: { HIGH: 'STORM_HIGH', CRITICAL: 'STORM_CRITICAL' },
  POOR_GROWTH: { HIGH: 'POOR_GROWTH', CRITICAL: 'POOR_GROWTH' },
};

async function isDuplicate(farmId, type) {
  const hours = Number(await getSetting('alerts.dedupHours')) || 24;
  const since = new Date(Date.now() - hours * 3600 * 1000);
  return (await prisma.alert.count({ where: { farmId, type, isSimulation: false, status: 'ACTIVE', createdAt: { gte: since } } })) > 0;
}

function buildMessage(farm, prediction, action, kind) {
  const risk = RISK_LABELS[prediction.riskType];
  const lvl = LEVEL_LABELS[prediction.riskLevel];
  const pct = Math.round(prediction.probability * 100);
  if (kind === 'HARVEST_WINDOW') {
    return {
      title: `Harvest window — ${farm.farmCode}`,
      titleSw: `Wakati wa mavuno — ${farm.farmCode}`,
      message: `${farm.name}: crop is at harvest stage. ${action ? action.action : ''}`.trim(),
      messageSw: `${farm.name}: mwani umefikia hatua ya kuvunwa. ${action ? action.actionSw : ''}`.trim(),
    };
  }
  if (kind === 'RISK_CHANGE') {
    return {
      title: `Risk increased — ${risk.en} ${lvl.en.toUpperCase()} (${farm.farmCode})`,
      titleSw: `Hatari imeongezeka — ${risk.sw}: ${lvl.sw} (${farm.farmCode})`,
      message: `${farm.name}: ${risk.en} risk rose to ${lvl.en.toUpperCase()} (${pct}%). ${action ? `Action: ${action.action}` : ''}`.trim(),
      messageSw: `${farm.name}: hatari ya ${risk.sw} imepanda hadi ${lvl.sw} (${pct}%). ${action ? `Hatua: ${action.actionSw}` : ''}`.trim(),
    };
  }
  return {
    title: `${lvl.en.toUpperCase()} ${risk.en} risk — ${farm.farmCode}`,
    titleSw: `${lvl.sw}: ${risk.sw} — ${farm.farmCode}`,
    message: `${farm.name}: ${risk.en} risk is ${lvl.en.toUpperCase()} (${pct}%) for the next ${prediction.forecastHorizonHours / 24} days. ${action ? `Action: ${action.action}` : ''}`.trim(),
    messageSw: `${farm.name}: ${lvl.sw} ya ${risk.sw} (${pct}%) kwa siku ${prediction.forecastHorizonHours / 24} zijazo. ${action ? `Hatua: ${action.actionSw}` : ''}`.trim(),
  };
}

async function recipientsFor(farm, severity) {
  const users = [];
  if (farm.farmer?.user) users.push({ ...farm.farmer.user, channels: ['IN_APP', 'SMS'], lang: farm.farmer.user.preferredLanguage });
  if (levelRank(severity) >= levelRank('HIGH') && farm.cooperativeId) {
    const staff = await prisma.user.findMany({ where: { cooperativeId: farm.cooperativeId, isActive: true, roles: { some: { role: { name: 'COOPERATIVE_ADMIN' } } } } });
    staff.forEach((u) => users.push({ ...u, channels: ['IN_APP'], lang: u.preferredLanguage }));
  }
  if (severity === 'CRITICAL') {
    const officers = await prisma.user.findMany({ where: { isActive: true, roles: { some: { role: { name: 'EXTENSION_OFFICER' } } } } });
    officers.forEach((u) => users.push({ ...u, channels: ['IN_APP'], lang: u.preferredLanguage }));
  }
  const seen = new Set();
  return users.filter((u) => (seen.has(u.id) ? false : seen.add(u.id)));
}

/**
 * AlertService — turns predictions into alerts (HIGH/CRITICAL heat & storm, poor growth,
 * harvest window, risk increases, missing reports) and fans them out via NotificationService.
 */
export const AlertService = {
  async fromPredictions({ farm, predictions, previous, actions, features, simulation = false }) {
    const created = [];
    for (const p of predictions) {
      const action = actions[p.riskType] || null;
      let type = TYPE_FOR[p.riskType]?.[p.riskLevel] || null;
      if (p.riskType === 'HARVEST_WINDOW' && features.maturityRatio != null && features.maturityRatio >= 0.9) type = 'HARVEST_WINDOW';
      const prev = previous[p.riskType];
      const rose = prev && levelRank(p.riskLevel) > levelRank(prev.riskLevel) && levelRank(p.riskLevel) >= levelRank('MEDIUM');
      if (!type && rose) type = 'RISK_CHANGE';
      if (!type) continue;
      if (!simulation && (await isDuplicate(farm.id, type))) continue;

      const msg = buildMessage(farm, p, action, type === 'HARVEST_WINDOW' || type === 'RISK_CHANGE' ? type : 'RISK');
      const alert = await prisma.alert.create({
        data: {
          farmId: farm.id, cooperativeId: farm.cooperativeId, predictionId: p.id, type, severity: p.riskLevel,
          ...msg, isSimulation: simulation, isDemo: farm.isDemo,
          ...(simulation ? { title: `[SIMULATION] ${msg.title}`, titleSw: `[MAJARIBIO] ${msg.titleSw}` } : {}),
        },
      });
      created.push(alert);
      if (!simulation) {
        for (const u of await recipientsFor(farm, p.riskLevel)) {
          const sw = u.lang === 'sw';
          const channels = levelRank(p.riskLevel) >= levelRank('HIGH') || type === 'HARVEST_WINDOW' ? u.channels : ['IN_APP'];
          await NotificationService.notifyUser(u, { title: sw ? alert.titleSw : alert.title, body: sw ? alert.messageSw : alert.message, alertId: alert.id, channels });
        }
      }
    }
    return created;
  },

  /** MISSING_REPORT alerts for active farms with no observation in N days. */
  async checkMissingReports() {
    const days = Number(await getSetting('alerts.missingReportDays')) || 14;
    const since = new Date(Date.now() - days * 86400000);
    const farms = await prisma.farm.findMany({
      where: { status: 'ACTIVE', plantingCycles: { some: { status: 'ACTIVE' } }, observations: { none: { observedAt: { gte: since } } } },
      include: { farmer: { include: { user: true } } },
    });
    const created = [];
    for (const farm of farms) {
      if (await isDuplicate(farm.id, 'MISSING_REPORT')) continue;
      const alert = await prisma.alert.create({
        data: {
          farmId: farm.id, cooperativeId: farm.cooperativeId, type: 'MISSING_REPORT', severity: 'MEDIUM', isDemo: farm.isDemo,
          title: `No farm report for ${days}+ days — ${farm.farmCode}`,
          titleSw: `Hakuna ripoti ya shamba kwa siku ${days}+ — ${farm.farmCode}`,
          message: `${farm.name} has no observation in the last ${days} days. Please record the seaweed condition so risks can be assessed.`,
          messageSw: `${farm.name} haina ripoti katika siku ${days} zilizopita. Tafadhali rekodi hali ya mwani ili hatari zitathminiwe.`,
        },
      });
      created.push(alert);
      if (farm.farmer?.user) {
        const sw = farm.farmer.user.preferredLanguage === 'sw';
        await NotificationService.notifyUser(farm.farmer.user, { title: sw ? alert.titleSw : alert.title, body: sw ? alert.messageSw : alert.message, alertId: alert.id, channels: ['IN_APP'] });
      }
    }
    return created;
  },
};
