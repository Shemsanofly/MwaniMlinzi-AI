import { createLiveWeatherProvider } from './weatherProvider.js';
import { createLiveOceanProvider } from './oceanProvider.js';

/**
 * EnvironmentalProvider — combines a WeatherProvider and an OceanProvider with fallback:
 *   LIVE → CACHED (last live reading within max age) → null (no reading; values are never invented).
 * Every returned block carries `source` and `provider` so the UI can label it honestly.
 */
export class EnvironmentalProvider {
  constructor({ weatherLive, oceanLive, cacheLookup } = {}) {
    this.weatherLive = weatherLive === undefined ? createLiveWeatherProvider() : weatherLive;
    this.oceanLive = oceanLive === undefined ? createLiveOceanProvider() : oceanLive;
    this.cacheLookup = cacheLookup || (async () => null); // (kind, loc) → cached record | null
  }

  status() {
    return {
      weather: { live: this.weatherLive?.name || null },
      ocean: { live: this.oceanLive?.name || null },
    };
  }

  /** → { weather, ocean, errors } — a block is null when neither a live nor a cached reading exists. */
  async fetch(loc) {
    const errors = {};
    const [weather, ocean] = await Promise.all([
      this.#withFallback('weather', this.weatherLive, loc, errors),
      this.#withFallback('ocean', this.oceanLive, loc, errors),
    ]);
    return { weather, ocean, errors };
  }

  async #withFallback(kind, live, loc, allErrors) {
    const errors = [];
    if (!live) errors.push(`${kind}: no provider configured`);
    else {
      try {
        const data = await live.fetch(loc);
        if (data && 'observedAt' in data && (data.observedAt == null || !Number.isFinite(+new Date(data.observedAt)))) {
          throw new Error('Provider timestamp is unavailable');
        }
        if (data && Object.values(data).some((value) => typeof value === 'number' && Number.isFinite(value))) {
          return { ...data, source: 'LIVE', provider: live.name };
        }
        errors.push(`${live.name}: no environmental values available`);
      } catch (err) {
        errors.push(`${live.name}: ${err.message}`);
      }
    }
    try {
      const cached = await this.cacheLookup(kind, loc);
      if (cached) return { ...cached, source: 'CACHED', provider: cached.provider || `${live?.name || kind} (cached)`, errors };
    } catch (err) {
      errors.push(`cache: ${err.message}`);
    }
    allErrors[kind] = errors;
    return null;
  }
}
