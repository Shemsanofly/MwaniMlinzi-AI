import { environmentReadings } from '../db/records.js';
import prisma from '../config/prisma.js';
import { EnvironmentalProvider } from '../providers/environmentalProvider.js';
import { getSetting } from './settingsService.js';
import { DAY_MS } from '../utils/dates.js';

/** Cache lookup: last LIVE reading near this location within the configured max age. */
async function cacheLookup(kind, { latitude, longitude }) {
  const maxAgeH = Number(await getSetting('environment.maxCacheAgeHours')) || 48;
  const since = new Date(Date.now() - maxAgeH * 3600 * 1000);
  const where = { source: 'LIVE', observedAt: { gte: since }, latitude: { gte: latitude - 0.05, lte: latitude + 0.05 }, longitude: { gte: longitude - 0.05, lte: longitude + 0.05 } };
  const row = kind === 'weather'
    ? await environmentReadings(prisma, 'WEATHER').findFirst({ where, orderBy: { createdAt: 'desc' } })
    : await environmentReadings(prisma, 'OCEAN').findFirst({ where, orderBy: { createdAt: 'desc' } });
  if (!row) return null;
  const { id, createdAt, source, ...rest } = row;
  return rest;
}

let providerInstance = null;
export function getEnvironmentalProvider() {
  if (!providerInstance) providerInstance = new EnvironmentalProvider({ cacheLookup });
  return providerInstance;
}
export function setEnvironmentalProvider(p) { providerInstance = p; }

/** CACHED if any available block came from the cache; a missing block stays null (never invented). */
const combinedSource = (w, o) => (w?.source === 'CACHED' || o?.source === 'CACHED' ? 'CACHED' : 'LIVE');
const withoutUnverifiedAnomaly = (row, provider = row?.ocean?.provider) => {
  if (!row) return row;
  return ['open-meteo-marine', 'cmems', 'copernicus-marine', 'stormglass'].includes(provider)
    ? { ...row, sstAnomalyC: null, sstAnomalyDays: null } : row;
};

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
  return { sstAnomalyDays: current?.sstAnomalyC == null ? null : days, sstTrend7d: trend == null ? null : Math.round(trend * 100) / 100 };
}

export const EnvironmentService = {
  /**
   * Fetch fresh data for a farm through the provider chain and persist it.
   * Returns null (and stores nothing) when neither weather nor ocean data is available.
   */
  async refreshForFarm(farm) {
    const loc = farm.location;
    if (!loc) return null;
    const { weather, ocean: oceanReading, errors } = await getEnvironmentalProvider().fetch({ latitude: loc.latitude, longitude: loc.longitude });
    const ocean = withoutUnverifiedAnomaly(oceanReading, oceanReading?.provider);
    if (!weather && !ocean) {
      console.warn(`[environment] no live or cached data for ${farm.farmCode || farm.id}:`, JSON.stringify(errors));
      return null;
    }
    const w = weather && await environmentReadings(prisma, 'WEATHER').create({
      data: {
        latitude: loc.latitude, longitude: loc.longitude, observedAt: weather.observedAt || new Date(), source: weather.source, provider: weather.provider,
        airTemperatureC: weather.airTemperatureC, rainfallMm: weather.rainfallMm, windSpeedKmh: weather.windSpeedKmh,
        windDirectionDeg: weather.windDirectionDeg, humidityPct: weather.humidityPct, condition: weather.condition,
      },
    });
    const o = ocean && await environmentReadings(prisma, 'OCEAN').create({
      data: {
        latitude: loc.latitude, longitude: loc.longitude, observedAt: ocean.observedAt || new Date(), source: ocean.source, provider: ocean.provider,
        seaSurfaceTempC: ocean.seaSurfaceTempC, sstAnomalyC: ocean.sstAnomalyC, waveHeightM: ocean.waveHeightM,
        currentVelocityMs: ocean.currentVelocityMs, salinityPsu: ocean.salinityPsu, chlorophyllMgM3: ocean.chlorophyllMgM3,
      },
    });
    const persistence = ocean ? await computeSstPersistence(farm.id, ocean) : { sstAnomalyDays: null };
    return prisma.environmentalObservation.create({
      data: {
        farmId: farm.id, observedAt: new Date(Math.min(...[w, o].filter(Boolean).map((reading) => +reading.observedAt))), source: combinedSource(weather, ocean), weatherSource: weather?.source ?? null, oceanSource: ocean?.source ?? null,
        weatherObservationId: w?.id ?? null, oceanObservationId: o?.id ?? null,
        seaSurfaceTempC: ocean?.seaSurfaceTempC ?? null, sstAnomalyC: ocean?.sstAnomalyC ?? null, sstAnomalyDays: persistence.sstAnomalyDays,
        waveHeightM: ocean?.waveHeightM ?? null, currentVelocityMs: ocean?.currentVelocityMs ?? null, salinityPsu: ocean?.salinityPsu ?? null, chlorophyllMgM3: ocean?.chlorophyllMgM3 ?? null,
        airTemperatureC: weather?.airTemperatureC ?? null, rainfallMm: weather?.rainfallMm ?? null, windSpeedKmh: weather?.windSpeedKmh ?? null,
        windDirectionDeg: weather?.windDirectionDeg ?? null, humidityPct: weather?.humidityPct ?? null, weatherCondition: weather?.condition ?? null,
      },
      include: { weather: { select: { provider: true, observedAt: true } }, ocean: { select: { provider: true, observedAt: true } } },
    });
  },

  async latestForFarm(farmId) {
    const row = await prisma.environmentalObservation.findFirst({
      where: { farmId },
      orderBy: { observedAt: 'desc' },
      include: { weather: { select: { provider: true, observedAt: true } }, ocean: { select: { provider: true, observedAt: true } } },
    });
    return withoutUnverifiedAnomaly(row);
  },

  /** Latest reading, refreshing if missing or older than `maxAgeHours`. */
  async currentForFarm(farm, { maxAgeHours = 6 } = {}) {
    const latest = await this.latestForFarm(farm.id);
    const ageHours = latest ? (Date.now() - new Date(latest.observedAt).getTime()) / 3600000 : Infinity;
    if (ageHours < maxAgeHours) return { ...latest, source: 'CACHED', weatherSource: latest.weatherSource ? 'CACHED' : null, oceanSource: latest.oceanSource ? 'CACHED' : null };
    const maxCacheAge = Number(await getSetting('environment.maxCacheAgeHours')) || 48;
    const fallback = ageHours <= maxCacheAge ? { ...latest, source: 'CACHED' } : null;
    try {
      return (await this.refreshForFarm(farm)) || fallback;
    } catch (err) {
      console.warn('[environment] refresh failed, using latest stored reading:', err.message);
      return fallback;
    }
  },

  async history(farmId, days = 14) {
    const rows = await prisma.environmentalObservation.findMany({
      where: { farmId, observedAt: { gte: new Date(Date.now() - days * DAY_MS) } },
      orderBy: { observedAt: 'asc' },
      include: { ocean: { select: { provider: true } } },
    });
    return rows.map((row) => withoutUnverifiedAnomaly(row));
  },

  providerStatus() { return getEnvironmentalProvider().status(); },
};
