import { http } from '../client.js';

// The response error interceptor, called directly with axios-shaped errors.
const reject = (err) => http.interceptors.response.handlers[0].rejected(err);
const axiosError = (status, data) => ({ response: { status, data }, config: { url: '/auth/login' } });

describe('API error normalisation', () => {
  test.each([500, 502, 503, 504])('a %i from a proxy/gateway (no API body) is reported as "server unreachable"', async (status) => {
    await expect(reject(axiosError(status, ''))).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  test('a 503 sent by the API itself keeps its code and message', async () => {
    const body = { success: false, error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } };
    await expect(reject(axiosError(503, body))).rejects.toMatchObject({ status: 503, code: 'DB_UNAVAILABLE', message: 'Database unavailable' });
  });

  test('a real 500 from the API stays a server error', async () => {
    await expect(reject(axiosError(500, { success: false, error: { code: 'INTERNAL', message: 'x' } }))).rejects.toMatchObject({ status: 500 });
  });

  test('no response at all is a network error', async () => {
    await expect(reject({ config: {} })).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });
});
