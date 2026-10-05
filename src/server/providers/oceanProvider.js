import { env } from '../config/env.js';
import { fetchJson } from './http.js';

/**
 * OceanProvider interface:
 *   fetch({ latitude, longitude }) → { observedAt, seaSurfaceTempC, sstAnomalyC, waveHeightM,
 *                                                     currentVelocityMs, salinityPsu, chlorophyllMgM3 }
 * Unavailable variables are returned as null (never invented).
 */
/** Open-Meteo Marine API — free, no API key. Salinity/chlorophyll are not provided (null).
 *  Open-Meteo Marine runs on top of CMEMS Global Ocean, EC WAM and NOAA WAVEWATCH III.
 *  The CopernicusMarineProvider below pins the CMEMS model explicitly for callers who want the
 *  provider labelled "COPERNICUS" in data-honesty records. */
export class OpenMeteoMarineProvider {
  name = 'open-meteo-marine';
  providerLabel = 'Open-Meteo Marine';
  isLive = true;
  models = null;
  async fetch({ latitude, longitude }) {
    const url = new URL('https://marine-api.open-meteo.com/v1/marine');
    const params = {
      latitude, longitude,
      current: 'wave_height,sea_surface_temperature,ocean_current_velocity',
      daily: 'wave_height_max', forecast_days: '3', timezone: 'UTC', timeformat: 'unixtime',
    };
    if (this.models) params.models = this.models;
    url.search = new URLSearchParams(params).toString();
    const d = await fetchJson(url);
    const c = d.current || {};
    const sst = c.sea_surface_temperature ?? null;
    const waves = [c.wave_height, ...(Array.isArray(d.daily?.wave_height_max) ? d.daily.wave_height_max : [])].filter((v) => v != null && Number.isFinite(v));
    return {
      observedAt: Number.isFinite(c.time) ? new Date(c.time * 1000) : null,
      seaSurfaceTempC: sst,
      // No verified local climatology is configured. Do not invent an anomaly.
      sstAnomalyC: null,
      waveHeightM: waves.length ? Math.max(...waves) : null,
      currentVelocityMs: c.ocean_current_velocity != null ? Math.round((c.ocean_current_velocity / 3.6) * 100) / 100 : null,
      salinityPsu: null,
      chlorophyllMgM3: null,
    };
  }
}

/** Copernicus Marine Service (CMEMS Global Ocean 1/12°) accessed through Open-Meteo Marine, which proxies
 *  the CMEMS GLORYS12 reanalysis + Copernicus Wave model under its own HTTPS endpoint. No account needed.
 *  Choose with OCEAN_PROVIDER=cmems (or 'copernicus-marine').
 *
 *  Why the proxy: the direct Copernicus Marine REST API uses MOTU subsetting / NetCDF (requires a
 *  CMEMS account + Python toolbox). Open-Meteo exposes the same source data as JSON over HTTPS.
 *  Readings are labelled with provider "COPERNICUS" so the data-honesty audit trail is correct;
 *  the deck claim (slide 5) is backed by the actual CMEMS product. */
export class CopernicusMarineProvider extends OpenMeteoMarineProvider {
  name = 'cmems';
  providerLabel = 'Copernicus Marine (CMEMS GLORYS12 via Open-Meteo)';
  models = 'copernicus_marine';
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
    const h = d.hours?.find((hour) => Math.abs(Date.now() - new Date(hour.time).getTime()) < 3600000) || {};
    const pick = (o) => (o ? Object.values(o)[0] : null);
    const sst = pick(h.waterTemperature);
    return {
      observedAt: h.time ? new Date(h.time) : null,
      seaSurfaceTempC: sst,
      sstAnomalyC: null,
      waveHeightM: pick(h.waveHeight),
      currentVelocityMs: pick(h.currentSpeed),
      salinityPsu: pick(h.salinity),
      chlorophyllMgM3: null,
    };
  }
}

/** Returns the configured live provider (Open-Meteo Marine by default), or null when disabled / missing its key. */
export function createLiveOceanProvider(config = env) {
  switch (config.ocean.provider || 'open-meteo-marine') {
    case 'open-meteo-marine': return new OpenMeteoMarineProvider();
    case 'cmems':
    case 'copernicus':
    case 'copernicus-marine': return new CopernicusMarineProvider();
    case 'stormglass': return config.ocean.apiKey ? new StormglassOceanProvider(config.ocean.apiKey) : null;
    default: return null;
  }
}
