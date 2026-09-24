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

http.interceptors.response.use(
  (res) => res,
  (err) => {
    if (!err.response) {
      return Promise.reject(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'Cannot reach the MwaniMlinzi server. Check your connection or that the backend is running.' }));
    }
    const body = err.response.data || {};
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
