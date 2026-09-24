import { DemoWeatherProvider, createLiveWeatherProvider } from './weatherProvider.js';
import { DemoOceanProvider, createLiveOceanProvider } from './oceanProvider.js';

/**
 * EnvironmentalProvider — combines a WeatherProvider and an OceanProvider with fallback:
 *   LIVE (if configured and DEMO_MODE=false) → CACHED (last live reading within max age) → DEMO.
 * Every returned block carries `source` and `provider` so the UI can label it honestly.
 */
export class EnvironmentalProvider {
  constructor({ weatherLive, oceanLive, weatherDemo, oceanDemo, cacheLookup } = {}) {
    this.weatherLive = weatherLive === undefined ? createLiveWeatherProvider() : weatherLive;
    this.oceanLive = oceanLive === undefined ? createLiveOceanProvider() : oceanLive;
    this.weatherDemo = weatherDemo || new DemoWeatherProvider();
    this.oceanDemo = oceanDemo || new DemoOceanProvider();
    this.cacheLookup = cacheLookup || (async () => null); // (kind, loc) → cached record | null
  }

  status() {
    return {
      weather: { live: this.weatherLive?.name || null, demo: this.weatherDemo.name },
      ocean: { live: this.oceanLive?.name || null, demo: this.oceanDemo.name },
    };
  }

  /** `useLive: false` (admin setting environment.preferLive) skips live providers and uses demo data. */
  async fetch(loc, { useLive = true } = {}) {
    const [weather, ocean] = await Promise.all([
      this.#withFallback('weather', useLive ? this.weatherLive : null, this.weatherDemo, loc),
      this.#withFallback('ocean', useLive ? this.oceanLive : null, this.oceanDemo, loc),
    ]);
    return { weather, ocean };
  }

  async #withFallback(kind, live, demo, loc) {
    const errors = [];
    if (live) {
      try {
        const data = await live.fetch(loc);
        return { ...data, source: 'LIVE', provider: live.name };
      } catch (err) {
        errors.push(`${live.name}: ${err.message}`);
      }
      try {
        const cached = await this.cacheLookup(kind, loc);
        if (cached) return { ...cached, source: 'CACHED', provider: cached.provider || `${live.name} (cached)`, errors };
      } catch (err) {
        errors.push(`cache: ${err.message}`);
      }
    }
    const data = await demo.fetch(loc);
    return { ...data, source: 'DEMO', provider: demo.name, ...(errors.length ? { errors } : {}) };
  }
}
