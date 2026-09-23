import { env } from '../config/env.js';
import { fetchJson } from './http.js';
import { demoWeather } from './demoProfiles.js';

/**
 * WeatherProvider interface:
 *   name: string, isLive: boolean
 *   fetch({ latitude, longitude, profile?, at? }) → { observedAt, airTemperatureC, rainfallMm, windSpeedKmh,
 *                                                     windDirectionDeg, humidityPct, condition }
 * Live values use the worst case over the next 72 h where forecasts are available (risk horizon).
 */
export class DemoWeatherProvider {
  name = 'demo-weather';
  isLive = false;
  async fetch(loc) { return demoWeather(loc); }
}

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
      forecast_days: '3', timezone: 'Africa/Dar_es_Salaam',
    }).toString();
    const d = await fetchJson(url);
    const c = d.current || {};
    return {
      observedAt: new Date(),
      airTemperatureC: c.temperature_2m ?? null,
      rainfallMm: maxOf(d.daily?.precipitation_sum),
      windSpeedKmh: Math.max(c.wind_speed_10m ?? 0, maxOf(d.daily?.wind_speed_10m_max) ?? 0),
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
      observedAt: new Date(),
      airTemperatureC: d.main?.temp ?? null,
      rainfallMm: d.rain?.['1h'] != null ? d.rain['1h'] * 24 : (d.rain?.['3h'] ?? 0) * 8,
      windSpeedKmh: d.wind?.speed != null ? d.wind.speed * 3.6 : null,
      windDirectionDeg: d.wind?.deg ?? null,
      humidityPct: d.main?.humidity ?? null,
      condition: d.weather?.[0]?.main || 'Unknown',
    };
  }
}

const maxOf = (arr) => (Array.isArray(arr) && arr.length ? Math.max(...arr.filter((v) => v != null)) : null);

/** Returns the configured live provider, or null when not configured / DEMO_MODE. */
export function createLiveWeatherProvider(config = env) {
  if (config.demoMode) return null;
  switch (config.weather.provider) {
    case 'open-meteo': return new OpenMeteoWeatherProvider();
    case 'openweathermap': return config.weather.apiKey ? new OpenWeatherMapProvider(config.weather.apiKey) : null;
    default: return null;
  }
}
