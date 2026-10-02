import prisma from '../../src/config/prisma.js';
import { api, auth, login } from '../helpers.js';
import { getGeocodingService, setGeocodingService } from '../../src/services/geocodingService.js';

afterAll(() => prisma.$disconnect());

describe('authenticated reverse geocoding', () => {
  let original; let calls; let farmer;
  beforeAll(async () => {
    original = getGeocodingService(); farmer = await login('farmer'); calls = [];
    setGeocodingService({ reverse: async (point) => { calls.push(point); return { status: 'FOUND', location: { locationName: 'Paje', district: 'Kusini', region: 'Zanzibar South and Central' } }; } });
  });
  afterAll(() => setGeocodingService(original));
  test('requires authentication', async () => {
    expect((await api().get('/api/location/reverse?latitude=-6.267&longitude=39.534')).status).toBe(401);
  });
  test('validates ranges and empty values before querying the provider', async () => {
    for (const query of ['latitude=91&longitude=39', 'latitude=-6&longitude=181', 'latitude=&longitude=39', 'latitude=nope&longitude=39']) {
      expect((await api().get(`/api/location/reverse?${query}`).set(auth(farmer))).status).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });
  test('returns provider place details for valid farmer coordinates', async () => {
    const response = await api().get('/api/location/reverse?latitude=-6.267&longitude=39.534&language=sw').set(auth(farmer));
    expect(response.status).toBe(200);
    expect(response.body.data.location.locationName).toBe('Paje');
    expect(calls[0]).toEqual({ latitude: -6.267, longitude: 39.534, language: 'sw' });
  });
});
