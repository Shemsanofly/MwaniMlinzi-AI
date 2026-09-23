import { between, seededRng } from './demoRandom.js';
import { climatologySst } from './climatology.js';

/**
 * Demo environmental profiles. Each demo farm carries a `demoScenario`
 * (NORMAL | HEAT | STORM | NEAR_HARVEST | POOR_GROWTH) so judges can see different outcomes.
 * All values produced here are labelled source=DEMO and are NOT real measurements.
 */
const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
const daysAgo = (at) => Math.max(0, Math.floor((Date.now() - new Date(at).getTime()) / 86400000));

export function demoOcean({ latitude, longitude, profile = 'NORMAL', at = new Date() }) {
  const rng = seededRng('ocean', latitude.toFixed(3), longitude.toFixed(3), dayKey(at), new Date(at).getUTCHours() >> 3);
  const ago = daysAgo(at);
  const clim = climatologySst(at);
  let anomaly = between(rng, -0.15, 0.35);
  let wave = between(rng, 0.45, 0.8);
  let current = between(rng, 0.18, 0.35);
  let salinity = between(rng, 34.0, 35.0);
  let chl = between(rng, 0.28, 0.5);
  switch (profile) {
    case 'HEAT':
      anomaly = ago <= 7 ? between(rng, 1.25, 1.55) : between(rng, 0.2, 0.5);
      wave = between(rng, 0.25, 0.38);
      current = between(rng, 0.1, 0.2);
      break;
    case 'STORM':
      if (ago <= 1) {
        wave = between(rng, 1.85, 2.1);
        current = between(rng, 0.65, 0.8);
      }
      break;
    case 'POOR_GROWTH':
      anomaly = between(rng, -0.8, -0.5);
      salinity = between(rng, 29.0, 29.6);
      chl = between(rng, 0.1, 0.15);
      break;
    default:
      break;
  }
  return {
    observedAt: new Date(at),
    seaSurfaceTempC: round(clim + anomaly),
    sstAnomalyC: round(anomaly),
    waveHeightM: round(wave),
    currentVelocityMs: round(current),
    salinityPsu: round(salinity),
    chlorophyllMgM3: round(chl),
  };
}

export function demoWeather({ latitude, longitude, profile = 'NORMAL', at = new Date() }) {
  const rng = seededRng('weather', latitude.toFixed(3), longitude.toFixed(3), dayKey(at), new Date(at).getUTCHours() >> 3);
  const ago = daysAgo(at);
  let air = between(rng, 27, 30);
  let rain = between(rng, 0, 3);
  let wind = between(rng, 10, 18);
  let humidity = between(rng, 70, 80);
  let condition = 'Partly cloudy';
  switch (profile) {
    case 'HEAT':
      air = between(rng, 31, 33); rain = 0; wind = between(rng, 6, 10); humidity = between(rng, 65, 72); condition = 'Sunny and hot';
      break;
    case 'STORM':
      if (ago <= 1) { wind = between(rng, 34, 40); rain = between(rng, 10, 16); humidity = between(rng, 85, 92); condition = 'Stormy'; }
      break;
    case 'NEAR_HARVEST':
      rain = between(rng, 0, 1); humidity = between(rng, 62, 70); condition = 'Sunny';
      break;
    case 'POOR_GROWTH':
      rain = between(rng, 6, 9); humidity = between(rng, 82, 88); condition = 'Rainy';
      break;
    default:
      break;
  }
  return {
    observedAt: new Date(at),
    airTemperatureC: round(air),
    rainfallMm: round(rain),
    windSpeedKmh: round(wind),
    windDirectionDeg: Math.round(between(rng, 90, 200)),
    humidityPct: round(humidity),
    condition,
  };
}

const round = (v) => Math.round(v * 100) / 100;
