import { env } from '../config/env.js';
import { fetchJson } from '../providers/http.js';

const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
export function addressFromNominatim(data) {
  if (!data || data.error || !data.address) return null;
  const a = data.address;
  const locationName = clean(a.village || a.town || a.city || a.hamlet || a.suburb || a.locality || a.neighbourhood || data.name, 120);
  if (!locationName) return null;
  return { locationName, district: clean(a.county || a.state_district || a.district, 80),
    region: clean(a.state || a.region, 80), country: clean(a.country, 120),
    displayName: clean(data.display_name, 500), source: 'OpenStreetMap / Nominatim',
    attribution: '© OpenStreetMap contributors', attributionUrl: 'https://www.openstreetmap.org/copyright',
    matchKind: 'NEAREST_MAPPED_PLACE' };
}

/** One provider request at a time, at most one start per 1.1 seconds, with bounded caching. */
export class GeocodingService {
  constructor({ request = fetchJson, baseUrl = env.geocoding.url, userAgent = env.geocoding.userAgent,
    clock = Date.now, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
    this.request = request; this.baseUrl = baseUrl; this.userAgent = userAgent;
    this.clock = clock; this.wait = wait; this.cache = new Map(); this.inFlight = new Map();
    this.queue = Promise.resolve(); this.lastStartedAt = 0;
  }

  async reverse({ latitude, longitude, language = 'en' }) {
    if (!this.baseUrl) return { status: 'UNAVAILABLE', location: null };
    const coordinates = { latitude: Number(latitude.toFixed(5)), longitude: Number(longitude.toFixed(5)) };
    const key = `${coordinates.latitude},${coordinates.longitude},${language}`;
    const cached = this.cache.get(key);
    if (cached && this.clock() - cached.at < 86400000) return { ...cached.result, cached: true };
    if (this.inFlight.has(key)) return this.inFlight.get(key);
    if (this.inFlight.size >= 2) return { status: 'UNAVAILABLE', reason: 'BUSY', location: null };
    const lookup = this.queue.catch(() => {}).then(async () => {
      await this.wait(Math.max(0, 1100 - (this.clock() - this.lastStartedAt)));
      this.lastStartedAt = this.clock();
      const url = new URL('reverse', `${this.baseUrl.replace(/\/$/, '')}/`);
      url.search = new URLSearchParams({ lat: coordinates.latitude, lon: coordinates.longitude,
        format: 'jsonv2', addressdetails: '1', zoom: '14', layer: 'address', 'accept-language': language }).toString();
      try {
        const body = await this.request(url, { timeoutMs: 8000, headers: { 'User-Agent': this.userAgent } });
        const location = addressFromNominatim(body);
        const result = { status: location ? 'FOUND' : 'NOT_FOUND', location, coordinates, cached: false, lookedUpAt: new Date(this.clock()).toISOString() };
        if (this.cache.size >= 500) this.cache.delete(this.cache.keys().next().value);
        this.cache.set(key, { at: this.clock(), result });
        return result;
      } catch (err) {
        console.warn('[geocoding] lookup unavailable:', err.message);
        return { status: 'UNAVAILABLE', location: null, coordinates, cached: false };
      }
    });
    this.queue = lookup;
    this.inFlight.set(key, lookup);
    try { return await lookup; } finally { this.inFlight.delete(key); }
  }
}

let service = new GeocodingService();
export const getGeocodingService = () => service;
export const setGeocodingService = (replacement) => { service = replacement; };
