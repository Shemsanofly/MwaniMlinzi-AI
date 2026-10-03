import { jest } from '@jest/globals';
import { addressFromNominatim, GeocodingService } from '../../src/services/geocodingService.js';

const result = { name: 'Paje', display_name: 'Paje, Kusini, Zanzibar South and Central, Tanzania',
  address: { village: 'Paje', county: 'Kusini', state: 'Zanzibar South and Central', country: 'Tanzania' } };

describe('real coordinate to place lookup', () => {
  test('fills actual mapped address fields without assuming missing district or region', () => {
    expect(addressFromNominatim(result)).toMatchObject({ locationName: 'Paje', district: 'Kusini', region: 'Zanzibar South and Central', matchKind: 'NEAREST_MAPPED_PLACE' });
    expect(addressFromNominatim({ name: 'Coastal village', address: {} })).toMatchObject({ locationName: 'Coastal village', district: '', region: '' });
    expect(addressFromNominatim({ address: { country: 'Tanzania' } })).toBeNull();
    expect(addressFromNominatim({ error: 'Unable to geocode', address: {} })).toBeNull();
  });

  test('requests provider coordinates and caches successful replies', async () => {
    const request = jest.fn(async () => result);
    const service = new GeocodingService({ request, baseUrl: 'https://nominatim.openstreetmap.org', userAgent: 'test-app', wait: async () => {} });
    const first = await service.reverse({ latitude: -6.267, longitude: 39.534, language: 'sw' });
    expect(first.status).toBe('FOUND');
    expect(first.cached).toBe(false);
    const url = request.mock.calls[0][0];
    expect(url.searchParams.get('lat')).toBe('-6.267');
    expect(url.searchParams.get('lon')).toBe('39.534');
    expect(url.searchParams.get('accept-language')).toBe('sw');
    expect(request.mock.calls[0][1].headers['User-Agent']).toBe('test-app');
    expect((await service.reverse({ latitude: -6.267, longitude: 39.534, language: 'sw' })).cached).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  test('serialises provider calls with the required interval', async () => {
    let now = 10000;
    const starts = [];
    const service = new GeocodingService({ request: async () => { starts.push(now); return result; },
      clock: () => now, wait: async (ms) => { now += ms; } });
    await Promise.all([service.reverse({ latitude: -6, longitude: 39 }), service.reverse({ latitude: -5, longitude: 39 })]);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1100);
  });

  test('provider failures and unmapped locations return no invented place', async () => {
    const failed = new GeocodingService({ request: async () => { throw new Error('offline'); }, wait: async () => {} });
    expect(await failed.reverse({ latitude: -6, longitude: 39 })).toMatchObject({ status: 'UNAVAILABLE', location: null });
    const empty = new GeocodingService({ request: async () => ({ error: 'No coverage' }), wait: async () => {} });
    expect(await empty.reverse({ latitude: -6, longitude: 39 })).toMatchObject({ status: 'NOT_FOUND', location: null });
  });
});
