import { Prisma } from '@prisma/client';
import prisma from '../config/prisma.js';
import { localDate } from '../ai/seaOutlook.js';
import { SeaOutlookService } from './seaOutlookService.js';
import { NotificationService } from './notificationService.js';

const DAY_MS = 86400000;
const NEAR_HARVEST_DAYS = 3;

/** Local midnight (Africa/Dar_es_Salaam, UTC+3, no DST) of `date` as a UTC Date. */
const localMidnight = (date) => new Date(`${date}T00:00:00+03:00`);

const SMS_SEGMENT = 160; // one billed SMS segment
const oneSegment = (text) => (text.length > SMS_SEGMENT ? `${text.slice(0, SMS_SEGMENT - 1).trimEnd()}…` : text);

/** Messages carry the date ("kesho (01/10)") so an old alert is never misread as current. */
function messages(farm, day, whenKey, advice) {
  const ddmm = `${day.date.slice(8, 10)}/${day.date.slice(5, 7)}`;
  const when = { en: whenKey === 'today' ? 'today' : 'tomorrow', sw: whenKey === 'today' ? 'leo' : 'kesho' };
  const chance = day.maxRainProbability != null
    ? { en: `${day.maxRainProbability}% chance of rain`, sw: `uwezekano wa mvua ${day.maxRainProbability}%` }
    : { en: 'rain expected', sw: 'mvua inatarajiwa' };
  const fallback = { en: 'Rain is likely during drying hours.', sw: 'Mvua inatarajiwa wakati wa kukausha.' };
  return {
    title: `Rain likely ${when.en} (${ddmm}) during drying — ${farm.farmCode}`,
    titleSw: `Mvua inatarajiwa ${when.sw} (${ddmm}) wakati wa kukausha — ${farm.farmCode}`,
    message: `${farm.name}, ${when.en} (${ddmm}): ${chance.en} during drying hours. ${advice ? advice.action : ''}`.trim(),
    messageSw: `${farm.name}, ${when.sw} (${ddmm}): ${chance.sw} wakati wa kukausha mwani. ${advice ? advice.actionSw : ''}`.trim(),
    sms: {
      en: oneSegment(`MWANIMLINZI ${farm.farmCode}, ${when.en} ${ddmm}: ${advice ? advice.action : fallback.en}`),
      sw: oneSegment(`MWANIMLINZI ${farm.farmCode}, ${when.sw} ${ddmm}: ${advice ? advice.actionSw : fallback.sw}`),
    },
  };
}

/**
 * Warns farmers who are harvesting (or about to) when rain is likely today or tomorrow during drying hours,
 * so harvested seaweed is not spoiled or dried on the ground. One warning per farm per local day.
 */
export const DryingAlertService = {
  async run({ now = new Date() } = {}) {
    const today = localDate(now);
    const tomorrow = localDate(new Date(now.getTime() + DAY_MS));
    const horizon = new Date(localMidnight(today).getTime() + (NEAR_HARVEST_DAYS + 1) * DAY_MS);
    const recentHarvest = new Date(now.getTime() - NEAR_HARVEST_DAYS * DAY_MS);
    // A warning is about today or tomorrow: once that day has passed it is resolved, so it never lingers as "kesho".
    const resolved = await prisma.alert.updateMany({
      where: { type: 'DRYING_WEATHER', status: { not: 'RESOLVED' }, createdAt: { lt: new Date(localMidnight(today).getTime() - DAY_MS) } },
      data: { status: 'RESOLVED' },
    });
    const farms = await prisma.farm.findMany({
      where: {
        status: 'ACTIVE',
        location: { not: Prisma.DbNull },
        OR: [
          { plantingCycles: { some: { status: 'ACTIVE', expectedHarvestDate: { lt: horizon } } } },
          { harvests: { some: { harvestDate: { gte: recentHarvest } } } },
        ],
      },
      include: { farmer: { include: { user: true } } },
    });
    let alerts = 0;
    for (const farm of farms) {
      try {
        const outlook = await SeaOutlookService.currentForFarm(farm, { now });
        if (!outlook) continue;
        const day = outlook.days.find((d) => d.date === today && d.verdict === 'BAD') || outlook.days.find((d) => d.date === tomorrow && d.verdict === 'BAD');
        if (!day) continue;
        const already = await prisma.alert.count({ where: { farmId: farm.id, type: 'DRYING_WEATHER', isSimulation: false, createdAt: { gte: localMidnight(today) } } });
        if (already) continue;
        const advice = day.date === today ? outlook.today.advice : await SeaOutlookService.adviceFor(day.level);
        const { sms, ...msg } = messages(farm, day, day.date === today ? 'today' : 'tomorrow', advice);
        const alert = await prisma.alert.create({ data: { farmId: farm.id, cooperativeId: farm.cooperativeId, type: 'DRYING_WEATHER', severity: 'HIGH', ...msg } });
        alerts += 1;
        if (farm.farmer?.user) {
          await NotificationService.notifyUser(farm.farmer.user, {
            type: 'DRYING_WARNING', priority: 'WARNING', source: 'DRYING_JOB', alertId: alert.id,
            title: { en: alert.title, sw: alert.titleSw }, body: { en: alert.message, sw: alert.messageSw }, sms,
          });
        }
      } catch (err) {
        console.warn('[drying] failed for', farm.farmCode, err.message);
      }
    }
    return { eligible: farms.length, alerts, resolved: resolved.count };
  },
};
