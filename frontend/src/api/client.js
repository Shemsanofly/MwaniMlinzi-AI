import axios from 'axios';

const TOKEN_KEY = 'mwanimlinzi.token';

export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* storage unavailable */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ } },
};

/** Normalised error thrown by every API call: { status, code, message, details }. */
export class ApiError extends Error {
  constructor({ status, code, message, details }) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
});

http.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

const unreachable = () => new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'Cannot reach the MwaniMlinzi server. Check your connection or that the backend is running.' });

http.interceptors.response.use(
  (res) => res,
  (err) => {
    if (!err.response) return Promise.reject(unreachable());
    const body = err.response.data || {};
    // Vite returns an empty 500 on ECONNREFUSED; gateways commonly return 502/503/504.
    // Responses without the API's own error body come from a proxy or gateway (e.g. the dev-server proxy
    // while the backend is stopped): the API was never reached, so report it as a connection problem.
    if ([500, 502, 503, 504].includes(err.response.status) && !body.error) return Promise.reject(unreachable());
    const e = new ApiError({
      status: err.response.status,
      code: body.error?.code || 'ERROR',
      message: body.error?.message || body.message || 'Something went wrong',
      details: body.error?.details,
    });
    if (e.status === 401 && onUnauthorized && !err.config?.url?.includes('/auth/login')) onUnauthorized();
    return Promise.reject(e);
  },
);

/** Unwraps `{ success, data }`. */
export const unwrap = (p) => p.then((r) => r.data.data);
