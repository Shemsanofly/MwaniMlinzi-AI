import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { fetchJson } from './http.js';

/**
 * WeatherProvider interface:
 *   name: string, isLive: boolean
 *   fetch({ latitude, longitude }) → { observedAt, airTemperatureC, rainfallMm, windSpeedKmh,
 *                                                     windDirectionDeg, humidityPct, condition }
 * Live values use the worst case over the next 72 h where forecasts are available (risk horizon).
 */
const WMO = { 0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 51: 'Drizzle', 61: 'Rain', 63: 'Rain', 65: 'Heavy rain', 80: 'Rain showers', 81: 'Rain showers', 82: 'Violent rain showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm' };

/** Open-Meteo — free, no API key required. https://open-meteo.com */
export class OpenMeteoWeatherProvider {
  name = 'open-meteo';
  isLive = true;
  async fetch({ latitude, longitude }) {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({
      latitude, longitude,
      current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code',
      daily: 'precipitation_sum,wind_speed_10m_max',
      forecast_days: '3', timezone: 'UTC', timeformat: 'unixtime',
    }).toString();
    const d = await fetchJson(url);
    const c = d.current || {};
    return {
      observedAt: Number.isFinite(c.time) ? new Date(c.time * 1000) : null,
      airTemperatureC: c.temperature_2m ?? null,
      rainfallMm: maxOf(d.daily?.precipitation_sum),
      windSpeedKmh: maxOf([c.wind_speed_10m, maxOf(d.daily?.wind_speed_10m_max)]),
      windDirectionDeg: c.wind_direction_10m ?? null,
      humidityPct: c.relative_humidity_2m ?? null,
      condition: WMO[c.weather_code] || 'Unknown',
    };
  }
}

/** OpenWeatherMap current weather — requires WEATHER_API_KEY. */
export class OpenWeatherMapProvider {
  name = 'openweathermap';
  isLive = true;
  constructor(apiKey) { this.apiKey = apiKey; }
  async fetch({ latitude, longitude }) {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&appid=${encodeURIComponent(this.apiKey)}`;
    const d = await fetchJson(url);
    return {
      observedAt: Number.isFinite(d.dt) ? new Date(d.dt * 1000) : null,
      airTemperatureC: d.main?.temp ?? null,
      // Current rainfall is not a 72-hour forecast; leave the risk input unavailable.
      rainfallMm: null,
      windSpeedKmh: d.wind?.speed != null ? d.wind.speed * 3.6 : null,
      windDirectionDeg: d.wind?.deg ?? null,
      humidityPct: d.main?.humidity ?? null,
      condition: d.weather?.[0]?.main || 'Unknown',
    };
  }
}

const maxOf = (arr) => {
  const vals = Array.isArray(arr) ? arr.filter((v) => v != null && Number.isFinite(v)) : [];
  return vals.length ? Math.max(...vals) : null;
};

/** Tanzania Meteorological Authority — authoritative national bulletins (deck slide 5).
 *  TMA has no public JSON API as of 2026, so this provider reads a JSON bulletin file dropped by sysops
 *  each morning (SFTP, scp, or an uploader cron). The file layout is region-keyed so Zanzibar farms are
 *  matched to Unguja or Pemba. If the file is missing or stale, we return null → the cache tier is used
 *  → otherwise the record is written as UNAVAILABLE (never invented).
 *
 *  Expected file shape (TMA_BULLETIN_PATH):
 *    {
 *      "issuedAt": "2026-10-01T06:00:00Z",
 *      "regions": {
 *        "Unguja": { "temperatureC": 29, "rainfallMm": 2.5, "windSpeedKmh": 18,
 *                    "windDirectionDeg": 120, "humidityPct": 78, "condition": "Partly cloudy" },
 *        "Pemba":  { ... }, "default": { ... }
 *      }
 *    }
 *  Max accepted age: `TMA_BULLETIN_MAX_HOURS` (default 24 h). */
export class TMAWeatherProvider {
  name = 'tma';
  providerLabel = 'Tanzania Meteorological Authority (bulletin file)';
  isLive = true;
  constructor({ bulletinPath, maxAgeHours = 24 } = {}) {
    this.bulletinPath = bulletinPath;
    this.maxAgeMs = maxAgeHours * 3600 * 1000;
  }
  // Rough bounding boxes for Zanzibar islands; everything outside falls to "default".
  static regionFor(latitude, longitude) {
    if (latitude >= -5.6 && latitude <= -4.7 && longitude >= 39.5 && longitude <= 40.0) return 'Pemba';
    if (latitude >= -6.6 && latitude <= -5.6 && longitude >= 39.0 && longitude <= 39.7) return 'Unguja';
    return 'default';
  }
  async fetch({ latitude, longitude }) {
    if (!this.bulletinPath) return null;
    const abs = path.isAbsolute(this.bulletinPath) ? this.bulletinPath : path.resolve(process.cwd(), this.bulletinPath);
    let text;
    try { text = await fs.readFile(abs, 'utf8'); } catch { return null; }
    let payload;
    try { payload = JSON.parse(text); } catch { return null; }
    const issuedAt = payload?.issuedAt ? new Date(payload.issuedAt) : null;
    if (!issuedAt || Number.isNaN(+issuedAt)) return null;
    if (Date.now() - +issuedAt > this.maxAgeMs) return null; // stale → let cache/UNAVAILABLE take over
    const region = TMAWeatherProvider.regionFor(latitude, longitude);
    const row = payload.regions?.[region] || payload.regions?.default;
    if (!row) return null;
    return {
      observedAt: issuedAt,
      airTemperatureC: row.temperatureC ?? null,
      rainfallMm: row.rainfallMm ?? null,
      windSpeedKmh: row.windSpeedKmh ?? null,
      windDirectionDeg: row.windDirectionDeg ?? null,
      humidityPct: row.humidityPct ?? null,
      condition: row.condition || 'Unknown',
    };
  }
}

/** Returns the configured live provider (Open-Meteo by default), or null when disabled / missing its key. */
export function createLiveWeatherProvider(config = env) {
  switch (config.weather.provider || 'open-meteo') {
    case 'open-meteo': return new OpenMeteoWeatherProvider();
    case 'openweathermap': return config.weather.apiKey ? new OpenWeatherMapProvider(config.weather.apiKey) : null;
    case 'tma': return config.weather.tmaBulletinPath
      ? new TMAWeatherProvider({ bulletinPath: config.weather.tmaBulletinPath, maxAgeHours: config.weather.tmaMaxAgeHours })
      : null;
    default: return null;
  }
}
