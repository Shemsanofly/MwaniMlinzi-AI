import { env } from '../config/env.js';
import { fetchJson } from './http.js';
import { demoOcean } from './demoProfiles.js';
import { climatologySst } from './climatology.js';

/**
 * OceanProvider interface:
 *   fetch({ latitude, longitude, profile?, at? }) → { observedAt, seaSurfaceTempC, sstAnomalyC, waveHeightM,
 *                                                     currentVelocityMs, salinityPsu, chlorophyllMgM3 }
 * Unavailable variables are returned as null (never invented).
 */
export class DemoOceanProvider {
  name = 'demo-ocean';
  isLive = false;
  async fetch(loc) { return demoOcean(loc); }
}

/** Open-Meteo Marine API — free, no API key. Salinity/chlorophyll are not provided (null). */
export class OpenMeteoMarineProvider {
  name = 'open-meteo-marine';
  isLive = true;
  async fetch({ latitude, longitude }) {
    const url = new URL('https://marine-api.open-meteo.com/v1/marine');
    url.search = new URLSearchParams({
      latitude, longitude,
      current: 'wave_height,sea_surface_temperature,ocean_current_velocity',
      daily: 'wave_height_max', forecast_days: '3', timezone: 'Africa/Dar_es_Salaam',
    }).toString();
    const d = await fetchJson(url);
    const c = d.current || {};
    const sst = c.sea_surface_temperature ?? null;
    const waves = [c.wave_height, ...(Array.isArray(d.daily?.wave_height_max) ? d.daily.wave_height_max : [])].filter((v) => v != null && Number.isFinite(v));
    return {
      observedAt: new Date(),
      seaSurfaceTempC: sst,
      sstAnomalyC: sst == null ? null : Math.round((sst - climatologySst()) * 100) / 100,
      waveHeightM: waves.length ? Math.max(...waves) : null,
      currentVelocityMs: c.ocean_current_velocity != null ? Math.round((c.ocean_current_velocity / 3.6) * 100) / 100 : null,
      salinityPsu: null,
      chlorophyllMgM3: null,
    };
  }
}

/** Stormglass — requires OCEAN_API_KEY. */
export class StormglassOceanProvider {
  name = 'stormglass';
  isLive = true;
  constructor(apiKey) { this.apiKey = apiKey; }
  async fetch({ latitude, longitude }) {
    const params = 'waterTemperature,waveHeight,currentSpeed,salinity';
    const url = `https://api.stormglass.io/v2/weather/point?lat=${latitude}&lng=${longitude}&params=${params}`;
    const d = await fetchJson(url, { headers: { Authorization: this.apiKey } });
    const h = d.hours?.[0] || {};
    const pick = (o) => (o ? Object.values(o)[0] : null);
    const sst = pick(h.waterTemperature);
    return {
      observedAt: new Date(),
      seaSurfaceTempC: sst,
      sstAnomalyC: sst == null ? null : Math.round((sst - climatologySst()) * 100) / 100,
      waveHeightM: pick(h.waveHeight),
      currentVelocityMs: pick(h.currentSpeed),
      salinityPsu: pick(h.salinity),
      chlorophyllMgM3: null,
    };
  }
}

export function createLiveOceanProvider(config = env) {
  if (config.demoMode) return null;
  switch (config.ocean.provider) {
    case 'open-meteo-marine': return new OpenMeteoMarineProvider();
    case 'stormglass': return config.ocean.apiKey ? new StormglassOceanProvider(config.ocean.apiKey) : null;
    default: return null;
  }
}
