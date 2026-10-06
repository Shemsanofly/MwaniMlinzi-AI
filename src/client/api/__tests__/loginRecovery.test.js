import { afterEach, describe, expect, test, vi } from 'vitest';
import { authApi } from '../endpoints.js';
import { ApiError, http } from '../client.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const unavailable = (code = 'NETWORK_ERROR') => new ApiError({ status: 0, code, message: 'Unavailable' });
const success = { data: { data: { token: 'test-token', user: { id: 'farmer' } } } };

describe('login connection recovery', () => {
  test.each(['NETWORK_ERROR', 'DATABASE_UNAVAILABLE'])('recovers automatically from %s', async (code) => {
    vi.useFakeTimers();
    const post = vi.spyOn(http, 'post').mockRejectedValueOnce(unavailable(code)).mockResolvedValueOnce(success);
    const login = authApi.login('0777000001', 'test-password');
    await vi.runAllTimersAsync();
    await expect(login).resolves.toEqual(success.data.data);
    expect(post).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenLastCalledWith('/auth/login', { identifier: '0777000001', password: 'test-password' }, { timeout: 10000 });
  });

  test('an ongoing outage stops after three attempts and remains an error', async () => {
    vi.useFakeTimers();
    const error = unavailable();
    const post = vi.spyOn(http, 'post').mockRejectedValue(error);
    const assertion = expect(authApi.login('0777000001', 'test-password')).rejects.toBe(error);
    await vi.runAllTimersAsync();
    await assertion;
    expect(post).toHaveBeenCalledTimes(3);
  });

  test.each(['INVALID_CREDENTIALS', 'VALIDATION_ERROR', 'RATE_LIMITED', 'INTERNAL_ERROR'])('%s is reported immediately', async (code) => {
    const error = new ApiError({ status: 401, code, message: code });
    const post = vi.spyOn(http, 'post').mockRejectedValue(error);
    await expect(authApi.login('0777000001', 'test-password')).rejects.toBe(error);
    expect(post).toHaveBeenCalledTimes(1);
  });

  test('registration is never replayed on a connection failure', async () => {
    const error = unavailable();
    const post = vi.spyOn(http, 'post').mockRejectedValue(error);
    await expect(authApi.register({ phone: '0777000001' })).rejects.toBe(error);
    expect(post).toHaveBeenCalledTimes(1);
  });
});
