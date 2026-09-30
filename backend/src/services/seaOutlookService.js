import prisma from '../config/prisma.js';
import { createOutlookProvider } from '../providers/outlookProvider.js';
import { dryingDays, extractTides, localDate, localDateTime, TIMEZONE } from '../ai/seaOutlook.js';
import { getSetting } from './settingsService.js';

const HOUR_MS = 3600 * 1000;
const FRESH_HOURS = 6; // the 06:00 / 14:00 runs keep a stored outlook fresh
const MAX_STORED_HOURS = 48; // never serve a forecast older than this (spec), whatever the environment cache setting
const RETRY_AFTER_MS = 15 * 60 * 1000; // after a failed live fetch, wait before trying again for the same farm
const NOTE = {
  en: 'Forecast — tide times may differ by about 30 minutes; check the shore before going out.',
  sw: 'Utabiri — muda wa maji kupwa unaweza kutofautiana kwa takriban dakika 30; angalia pwani kabla ya kwenda.',
};

let providerInstance;
const lastFailedAttempt = new Map(); // farmId → time of the last live fetch that produced nothing
const inFlight = new Map(); // farmId → refresh promise shared by concurrent requests

export function getOutlookProvider() {
  if (providerInstance === undefined) providerInstance = createOutlookProvider();
  return providerInstance;
}
export function setOutlookProvider(p) {
  providerInstance = p;
  lastFailedAttempt.clear();
  inFlight.clear();
}

/** Approved drying advice from the Action Library for a verdict level (LOW/MEDIUM/HIGH). */
async function adviceFor(level) {
  if (!level) return null;
  const requireValidated = (await getSetting('actions.requireValidated')) === true;
  const a = await prisma.actionLibrary.findFirst({
    where: { riskType: 'DRYING_WEATHER', enabled: true, minimumRiskLevel: level, ...(requireValidated ? { validated: true } : {}) },
    orderBy: [{ priority: 'desc' }, { code: 'asc' }],
  });
  return a && { code: a.code, action: a.action, actionSw: a.actionSw, explanation: a.explanation, explanationSw: a.explanationSw, validated: a.validated };
}

const maxStoredMs = async () => Math.min(Number(await getSetting('environment.maxCacheAgeHours')) || MAX_STORED_HOURS, MAX_STORED_HOURS) * HOUR_MS;
const tideAt = (row) => row.tideFetchedAt || row.fetchedAt;
const rainAt = (row) => row.rainFetchedAt || row.fetchedAt;

/** Latest stored part (tides or drying) for a farm that is still within the maximum stored age. */
async function lastStoredPart(farmId, part, now) {
  const since = new Date(now.getTime() - (await maxStoredMs()));
  const row = await prisma.seaOutlook.findFirst({ where: { farmId, [part]: { not: null }, fetchedAt: { gte: since } }, orderBy: { fetchedAt: 'desc' } });
  if (!row) return null;
  const at = part === 'tides' ? tideAt(row) : rainAt(row);
  return at >= since ? { value: row[part], at, provider: part === 'tides' ? row.tideProvider : row.rainProvider } : null;
}

export const SeaOutlookService = {
  adviceFor,

  /**
   * Fetch, calculate and store a new outlook. A part that fails live is carried over from the last stored
   * reading (≤ 48 h) with its own fetch time, so one failing API never wipes the other. Returns null (stores
   * nothing) when no part is available at all.
   */
  async refreshForFarm(farm, { now = new Date() } = {}) {
    const loc = farm.location;
    const provider = getOutlookProvider();
    if (!loc || !provider) return null;
    const r = await provider.fetch({ latitude: loc.latitude, longitude: loc.longitude });
    const liveTides = r.tide ? extractTides(r.tide.times, r.tide.levels) : [];
    const liveDrying = r.rain ? dryingDays(r.rain.times, r.rain.probability, r.rain.mm, await getSetting('drying.thresholds')) : [];
    const tides = liveTides.length ? { value: liveTides, at: now, provider: r.providers?.tide ?? null } : await lastStoredPart(farm.id, 'tides', now);
    const drying = liveDrying.some((d) => d.verdict)
      ? { value: liveDrying, at: now, provider: r.providers?.rain ?? null }
      : await lastStoredPart(farm.id, 'drying', now);
    if (!liveTides.length || !liveDrying.some((d) => d.verdict)) {
      console.warn(`[outlook] partial or no live forecast for ${farm.farmCode || farm.id}:`, JSON.stringify(r.errors || {}));
    }
    if ((!liveTides.length && !liveDrying.some((d) => d.verdict)) || (!tides && !drying)) return null;
    return prisma.seaOutlook.create({
      data: {
        farmId: farm.id,
        fetchedAt: now,
        tides: tides?.value ?? null,
        tideFetchedAt: tides?.at ?? null,
        tideProvider: tides?.provider ?? null,
        drying: drying?.value ?? null,
        rainFetchedAt: drying?.at ?? null,
        rainProvider: drying?.provider ?? null,
      },
    });
  },

  /**
   * Outlook for a farm: the stored result if fresh (06:00/14:00 runs); else — only when `refresh` is allowed —
   * one live refresh (shared by concurrent requests, not retried within 15 min after a failure); else the last
   * stored one (≤ 48 h, CACHED). Null when there is nothing for today or later.
   * USSD passes `refresh: false`: it answers from the stored result instantly (deck slide 7).
   */
  async currentForFarm(farm, { now = new Date(), refresh = true } = {}) {
    if (!farm?.location) return null;
    const latest = await prisma.seaOutlook.findFirst({ where: { farmId: farm.id }, orderBy: { fetchedAt: 'desc' } });
    const age = latest ? now - latest.fetchedAt : Infinity;
    if (latest && age < FRESH_HOURS * HOUR_MS) return this.serialize(latest, { now });
    const failedAt = lastFailedAttempt.get(farm.id);
    if (refresh && getOutlookProvider() && !(failedAt && now - failedAt < RETRY_AFTER_MS)) {
      if (!inFlight.has(farm.id)) {
        inFlight.set(farm.id, this.refreshForFarm(farm, { now })
          .catch((err) => { console.warn('[outlook] refresh failed:', err.message); return null; })
          .finally(() => inFlight.delete(farm.id)));
      }
      const fresh = await inFlight.get(farm.id);
      if (fresh) { lastFailedAttempt.delete(farm.id); return this.serialize(fresh, { now }); }
      lastFailedAttempt.set(farm.id, now);
    }
    if (latest && age < (await maxStoredMs())) return this.serialize(latest, { now });
    return null;
  },

  /** Public shape; null when the stored forecast has nothing left for today or later. */
  async serialize(row, { now = new Date() } = {}) {
    const today = localDate(now);
    const nowLocal = localDateTime(now);
    const tides = (row.tides || []).filter((t) => t.time.slice(0, 10) >= today);
    const lows = tides.filter((t) => t.type === 'LOW');
    const days = (row.drying || []).filter((d) => d.date >= today);
    if (!tides.length && !days.length) return null;
    const drying = days.find((d) => d.date === today) || null;
    const freshMs = FRESH_HOURS * HOUR_MS;
    const partsFresh = (!row.tides || now - tideAt(row) < freshMs) && (!row.drying || now - rainAt(row) < freshMs);
    return {
      fetchedAt: row.fetchedAt,
      source: partsFresh ? 'LIVE' : 'CACHED',
      providers: { tide: row.tideProvider, rain: row.rainProvider },
      partTimes: { tide: row.tides ? tideAt(row) : null, rain: row.drying ? rainAt(row) : null },
      timezone: TIMEZONE,
      note: NOTE,
      tides,
      today: {
        date: today,
        lowTides: lows.filter((t) => t.time.startsWith(today)),
        nextWorkWindow: lows.find((t) => t.daylight && t.window && t.window.end >= nowLocal) || null,
        drying,
        advice: await adviceFor(drying?.level),
      },
      days,
    };
  },
};
