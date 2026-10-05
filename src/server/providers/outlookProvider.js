import { env } from '../config/env.js';
import { fetchJson } from './http.js';
import { TIMEZONE, localDateTime } from '../ai/seaOutlook.js';

/** Hourly series → { times, ...values } or null when the response has no usable values (never zero-filled). */
function series(times, columns) {
  if (!Array.isArray(times) || !times.length) throw new Error('no values');
  const cols = Object.fromEntries(Object.entries(columns).map(([k, v]) => [k, Array.isArray(v) ? v : []]));
  const any = Object.values(cols).some((v) => v.some((x) => x != null && Number.isFinite(x)));
  if (!any) throw new Error('no values');
  return { times, ...cols };
}

/**
 * Open-Meteo (free, no key) — 3-day hourly sea level (tides, Marine API) and rain probability/amount (Forecast API),
 * in local Zanzibar time. Each part is fetched independently: a failing part is null with its error.
 */
export class OpenMeteoOutlookProvider {
  name = 'open-meteo';
  constructor({ tideEnabled = true, rainEnabled = true, request = fetchJson } = {}) {
    this.tideEnabled = tideEnabled;
    this.rainEnabled = rainEnabled;
    this.request = request;
  }

  async fetch({ latitude, longitude }) {
    const errors = {};
    const common = { latitude, longitude, forecast_days: '3', timezone: TIMEZONE, timeformat: 'unixtime' };
    const get = async (part, base, hourly, parse) => {
      if (!(part === 'tide' ? this.tideEnabled : this.rainEnabled)) { errors[part] = 'disabled'; return null; }
      try {
        const url = new URL(base);
        url.search = new URLSearchParams({ ...common, hourly, ...(part === 'rain' ? { current: 'precipitation,temperature_2m,weather_code' } : {}) }).toString();
        const d = await this.request(url);
        const h = d.hourly || {};
        const times = (h.time || []).map((time) => typeof time === 'number' ? localDateTime(new Date(time * 1000)) : time);
        return parse({ ...h, time: times }, d);
      } catch (err) {
        errors[part] = err.message;
        return null;
      }
    };
    const [tide, rain] = await Promise.all([
      get('tide', 'https://marine-api.open-meteo.com/v1/marine', 'sea_level_height_msl', (h) => {
        const s = series(h.time, { levels: h.sea_level_height_msl });
        return { times: s.times, levels: s.levels };
      }),
      get('rain', 'https://api.open-meteo.com/v1/forecast', 'precipitation_probability,precipitation', (h, d) => {
        const s = series(h.time, { probability: h.precipitation_probability, mm: h.precipitation });
        const c = d.current;
        const current = c && typeof c.time === 'number' && Number.isFinite(c.time) && Number.isFinite(c.precipitation) && c.precipitation >= 0
          && Number.isFinite(c.interval) && c.interval > 0 && c.interval <= 3600 ? {
            observedAt: new Date(c.time * 1000).toISOString(), precipitationMm: c.precipitation,
            intervalMinutes: c.interval / 60, temperatureC: Number.isFinite(c.temperature_2m) ? c.temperature_2m : null,
            weatherCode: Number.isInteger(c.weather_code) ? c.weather_code : null, dataKind: 'MODEL_ESTIMATE',
          } : null;
        return { times: s.times, probability: s.probability, mm: s.mm, current };
      }),
    ]);
    return { tide, rain, providers: { tide: 'open-meteo-marine', rain: 'open-meteo' }, errors };
  }
}

/** Follows OCEAN_PROVIDER / WEATHER_PROVIDER: 'none' switches that part off; both 'none' → no provider. */
export function createOutlookProvider(config = env) {
  const tideEnabled = config.ocean?.provider !== 'none';
  const rainEnabled = config.weather?.provider !== 'none';
  if (!tideEnabled && !rainEnabled) return null;
  return new OpenMeteoOutlookProvider({ tideEnabled, rainEnabled });
}
