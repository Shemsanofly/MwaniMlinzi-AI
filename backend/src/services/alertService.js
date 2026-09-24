import prisma from '../config/prisma.js';
import { levelRank, RISK_LABELS, LEVEL_LABELS } from '../ai/constants.js';
import { getSetting } from './settingsService.js';
import { NotificationService } from './notificationService.js';

const TYPE_FOR = {
  HEAT_ICE_ICE: { HIGH: 'HEAT_HIGH', CRITICAL: 'HEAT_CRITICAL' },
  STORM_LINE_DAMAGE: { HIGH: 'STORM_HIGH', CRITICAL: 'STORM_CRITICAL' },
  POOR_GROWTH: { HIGH: 'POOR_GROWTH', CRITICAL: 'POOR_GROWTH' },
};

const PRIORITY_FOR_LEVEL = { LOW: 'INFO', MEDIUM: 'WARNING', HIGH: 'HIGH', CRITICAL: 'CRITICAL' };
const SMS_LEVEL = { en: { HIGH: 'HIGH', CRITICAL: 'CRITICAL' }, sw: { HIGH: 'HATARI KUBWA', CRITICAL: 'HATARI KUBWA SANA' } };

/** Short SMS text (both languages) for an alert; null when the alert should not be sent by SMS. */
export function smsForAlert(farm, prediction, action, type) {
  if (type === 'HARVEST_WINDOW') {
    return {
      en: `MWANIMLINZI: Seaweed on farm ${farm.farmCode} is ready for harvest.${action ? ` ${action.action}` : ''}`,
      sw: `MWANIMLINZI: Mwani wa shamba ${farm.farmCode} uko tayari kuvunwa.${action ? ` ${action.actionSw}` : ''}`,
    };
  }
  if (!['HIGH', 'CRITICAL'].includes(prediction.riskLevel)) return null;
  const risk = RISK_LABELS[prediction.riskType];
  return {
    en: `MWANIMLINZI: ${risk.en} risk on farm ${farm.farmCode} is now ${SMS_LEVEL.en[prediction.riskLevel]}.${action ? ` Action: ${action.action}` : ''}`,
    sw: `MWANIMLINZI: Hatari ya ${risk.sw.toLowerCase()} kwa shamba ${farm.farmCode} sasa ni ${SMS_LEVEL.sw[prediction.riskLevel]}.${action ? ` Hatua: ${action.actionSw}` : ''}`,
  };
}

async function isDuplicate(farmId, type) {
  const hours = Number(await getSetting('alerts.dedupHours')) || 24;
  const since = new Date(Date.now() - hours * 3600 * 1000);
  return (await prisma.alert.count({ where: { farmId, type, isSimulation: false, status: 'ACTIVE', createdAt: { gte: since } } })) > 0;
}

function buildMessage(farm, prediction, action, kind) {
  const risk = RISK_LABELS[prediction.riskType];
  const lvl = LEVEL_LABELS[prediction.riskLevel];
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
      message: `${farm.name}: ${risk.en} risk rose to ${lvl.en.toUpperCase()}. ${action ? `Action: ${action.action}` : ''}`.trim(),
      messageSw: `${farm.name}: hatari ya ${risk.sw} imepanda hadi ${lvl.sw}. ${action ? `Hatua: ${action.actionSw}` : ''}`.trim(),
    };
  }
  return {
    title: `${lvl.en.toUpperCase()} ${risk.en} risk — ${farm.farmCode}`,
    titleSw: `${lvl.sw}: ${risk.sw} — ${farm.farmCode}`,
    message: `${farm.name}: ${risk.en} risk is ${lvl.en.toUpperCase()} for the next ${prediction.forecastHorizonHours / 24} days. ${action ? `Action: ${action.action}` : ''}`.trim(),
    messageSw: `${farm.name}: ${lvl.sw} ya ${risk.sw} kwa siku ${prediction.forecastHorizonHours / 24} zijazo. ${action ? `Hatua: ${action.actionSw}` : ''}`.trim(),
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
  /** @param opts.sendSms false for seeding/back-fills (in-app only). Simulations never notify anyone. */
  async fromPredictions({ farm, predictions, previous, actions, features, simulation = false, sendSms = true }) {
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
      // One harvest reminder per planting cycle (not one per day).
      if (!simulation && type === 'HARVEST_WINDOW' && p.plantingCycleId) {
        const cycle = await prisma.plantingCycle.findUnique({ where: { id: p.plantingCycleId }, select: { plantingDate: true } });
        if (cycle && (await prisma.alert.count({ where: { farmId: farm.id, type: 'HARVEST_WINDOW', isSimulation: false, createdAt: { gte: cycle.plantingDate } } })) > 0) continue;
      }

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
        const isHarvest = type === 'HARVEST_WINDOW';
        const priority = isHarvest ? 'WARNING' : PRIORITY_FOR_LEVEL[p.riskLevel];
        const sms = sendSms ? smsForAlert(farm, p, action, type) : null;
        for (const u of await recipientsFor(farm, p.riskLevel)) {
          const isFarmer = u.id === farm.farmer?.user?.id;
          await NotificationService.notifyUser(u, {
            type: isHarvest ? 'HARVEST_REMINDER' : 'RISK_ALERT', priority, source: 'RISK_ENGINE', alertId: alert.id,
            title: { en: alert.title, sw: alert.titleSw }, body: { en: alert.message, sw: alert.messageSw },
            // Only the farmer gets SMS; SMSService still checks opt-in, preferences and priority.
            sms: isFarmer ? sms : null,
          });
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
        await NotificationService.notifyUser(farm.farmer.user, {
          type: 'SYSTEM', priority: 'WARNING', source: 'MISSING_REPORT_JOB', alertId: alert.id,
          title: { en: alert.title, sw: alert.titleSw }, body: { en: alert.message, sw: alert.messageSw },
        });
      }
    }
    return created;
  },
};
