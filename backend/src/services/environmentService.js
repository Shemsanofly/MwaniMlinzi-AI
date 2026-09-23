import prisma from '../config/prisma.js';
import { EnvironmentalProvider } from '../providers/environmentalProvider.js';
import { getSetting } from './settingsService.js';
import { DAY_MS } from '../utils/dates.js';

/** Cache lookup: last LIVE reading near this location within the configured max age. */
async function cacheLookup(kind, { latitude, longitude }) {
  const maxAgeH = Number(await getSetting('environment.maxCacheAgeHours')) || 48;
  const since = new Date(Date.now() - maxAgeH * 3600 * 1000);
  const where = { source: 'LIVE', createdAt: { gte: since }, latitude: { gte: latitude - 0.05, lte: latitude + 0.05 }, longitude: { gte: longitude - 0.05, lte: longitude + 0.05 } };
  const row = kind === 'weather'
    ? await prisma.weatherObservation.findFirst({ where, orderBy: { createdAt: 'desc' } })
    : await prisma.oceanObservation.findFirst({ where, orderBy: { createdAt: 'desc' } });
  if (!row) return null;
  const { id, createdAt, source, isDemo, ...rest } = row;
  return rest;
}

let providerInstance = null;
export function getEnvironmentalProvider() {
  if (!providerInstance) providerInstance = new EnvironmentalProvider({ cacheLookup });
  return providerInstance;
}
export function setEnvironmentalProvider(p) { providerInstance = p; }

const combinedSource = (a, b) => (a === 'DEMO' || b === 'DEMO' ? 'DEMO' : a === 'CACHED' || b === 'CACHED' ? 'CACHED' : 'LIVE');

/** Consecutive days (ending today) whose max SST anomaly exceeded 0.5 °C, plus the 7-day SST trend. */
export async function computeSstPersistence(farmId, current) {
  const since = new Date(Date.now() - 14 * DAY_MS);
  const history = await prisma.environmentalObservation.findMany({
    where: { farmId, observedAt: { gte: since } },
    select: { observedAt: true, sstAnomalyC: true, seaSurfaceTempC: true },
    orderBy: { observedAt: 'desc' },
  });
  const byDay = new Map();
  const all = current ? [{ observedAt: current.observedAt || new Date(), sstAnomalyC: current.sstAnomalyC, seaSurfaceTempC: current.seaSurfaceTempC }, ...history] : history;
  for (const h of all) {
    const k = new Date(h.observedAt).toISOString().slice(0, 10);
    byDay.set(k, Math.max(byDay.get(k) ?? -Infinity, h.sstAnomalyC ?? -Infinity));
  }
  let days = 0;
  for (let i = 0; i < 14; i += 1) {
    const k = new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10);
    const v = byDay.get(k);
    if (v === undefined) { if (i === 0) continue; break; }
    if (v > 0.5) days += 1; else break;
  }
  const currentSst = all[0]?.seaSurfaceTempC;
  const weekAgo = history.filter((h) => Date.now() - new Date(h.observedAt).getTime() >= 6 * DAY_MS && h.seaSurfaceTempC != null);
  const trend = currentSst != null && weekAgo.length ? currentSst - weekAgo[0].seaSurfaceTempC : null;
  return { sstAnomalyDays: days, sstTrend7d: trend == null ? null : Math.round(trend * 100) / 100 };
}

export const EnvironmentService = {
  /** Fetch fresh data for a farm through the provider chain and persist it. */
  async refreshForFarm(farm) {
    const loc = farm.location;
    if (!loc) return null;
    const { weather, ocean } = await getEnvironmentalProvider().fetch({ latitude: loc.latitude, longitude: loc.longitude, profile: farm.demoScenario || 'NORMAL' });
    const isDemoW = weather.source === 'DEMO';
    const isDemoO = ocean.source === 'DEMO';
    const w = await prisma.weatherObservation.create({
      data: {
        latitude: loc.latitude, longitude: loc.longitude, observedAt: weather.observedAt || new Date(), source: weather.source, provider: weather.provider,
        airTemperatureC: weather.airTemperatureC, rainfallMm: weather.rainfallMm, windSpeedKmh: weather.windSpeedKmh,
        windDirectionDeg: weather.windDirectionDeg, humidityPct: weather.humidityPct, condition: weather.condition, isDemo: isDemoW,
      },
    });
    const o = await prisma.oceanObservation.create({
      data: {
        latitude: loc.latitude, longitude: loc.longitude, observedAt: ocean.observedAt || new Date(), source: ocean.source, provider: ocean.provider,
        seaSurfaceTempC: ocean.seaSurfaceTempC, sstAnomalyC: ocean.sstAnomalyC, waveHeightM: ocean.waveHeightM,
        currentVelocityMs: ocean.currentVelocityMs, salinityPsu: ocean.salinityPsu, chlorophyllMgM3: ocean.chlorophyllMgM3, isDemo: isDemoO,
      },
    });
    const persistence = await computeSstPersistence(farm.id, ocean);
    return prisma.environmentalObservation.create({
      data: {
        farmId: farm.id, observedAt: new Date(), source: combinedSource(weather.source, ocean.source), weatherSource: weather.source, oceanSource: ocean.source,
        weatherObservationId: w.id, oceanObservationId: o.id,
        seaSurfaceTempC: ocean.seaSurfaceTempC, sstAnomalyC: ocean.sstAnomalyC, sstAnomalyDays: persistence.sstAnomalyDays,
        waveHeightM: ocean.waveHeightM, currentVelocityMs: ocean.currentVelocityMs, salinityPsu: ocean.salinityPsu, chlorophyllMgM3: ocean.chlorophyllMgM3,
        airTemperatureC: weather.airTemperatureC, rainfallMm: weather.rainfallMm, windSpeedKmh: weather.windSpeedKmh,
        windDirectionDeg: weather.windDirectionDeg, humidityPct: weather.humidityPct, weatherCondition: weather.condition,
        isDemo: isDemoW || isDemoO,
      },
      include: { weather: { select: { provider: true } }, ocean: { select: { provider: true } } },
    });
  },

  async latestForFarm(farmId) {
    return prisma.environmentalObservation.findFirst({
      where: { farmId },
      orderBy: { observedAt: 'desc' },
      include: { weather: { select: { provider: true } }, ocean: { select: { provider: true } } },
    });
  },

  /** Latest reading, refreshing if missing or older than `maxAgeHours`. */
  async currentForFarm(farm, { maxAgeHours = 6 } = {}) {
    const latest = await this.latestForFarm(farm.id);
    if (latest && Date.now() - new Date(latest.observedAt).getTime() < maxAgeHours * 3600 * 1000) return latest;
    try {
      return (await this.refreshForFarm(farm)) || latest;
    } catch (err) {
      console.warn('[environment] refresh failed, using latest stored reading:', err.message);
      return latest;
    }
  },

  async history(farmId, days = 14) {
    return prisma.environmentalObservation.findMany({
      where: { farmId, observedAt: { gte: new Date(Date.now() - days * DAY_MS) } },
      orderBy: { observedAt: 'asc' },
    });
  },

  providerStatus() { return getEnvironmentalProvider().status(); },
};
