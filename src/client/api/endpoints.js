import { http, unwrap } from './client.js';

/**
 * Every backend call used by the UI. Each function resolves to the `data` payload of the
 * standard `{ success, data, message }` response, or throws ApiError.
 */
const qs = (params = {}) => {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return p.length ? `?${new URLSearchParams(p).toString()}` : '';
};

async function loginWithRecovery(identifier, password) {
  // Reconnect briefly after server startup/restart. Never replay writes such
  // as registration, payments or password changes, or rejected credentials.
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await unwrap(http.post('/auth/login', { identifier, password }, { timeout: 10000 }));
    } catch (err) {
      const temporary = err.code === 'NETWORK_ERROR' || err.code === 'DATABASE_UNAVAILABLE';
      if (!temporary || attempt >= 2) throw err;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}

export const authApi = {
  login: loginWithRecovery,
  changePassword: (currentPassword, newPassword) => unwrap(http.post('/auth/change-password', { currentPassword, newPassword })),
  register: (body) => unwrap(http.post('/auth/register', body)),
  me: () => unwrap(http.get('/auth/me')),
  updateMe: (body) => unwrap(http.patch('/auth/me', body)),
  logout: () => unwrap(http.post('/auth/logout')),
  forgotPassword: (email) => unwrap(http.post('/auth/forgot-password', { email })),
  resetPassword: (body) => unwrap(http.post('/auth/reset-password', body)),
};

export const metaApi = {
  health: () => unwrap(http.get('/health')),
  species: () => unwrap(http.get('/species')),
  publicCooperatives: () => unwrap(http.get('/cooperatives/public')),
};

export const locationApi = {
  reverse: (latitude, longitude, language) => unwrap(http.get(`/location/reverse${qs({ latitude, longitude, language })}`)),
};

/** Record book: kind = 'sales' | 'costs' | 'work'. */
export const recordsApi = {
  summary: (farmId, params) => unwrap(http.get(`/farms/${farmId}/records/summary${qs(params)}`)),
  list: (kind, farmId, params) => unwrap(http.get(`/farms/${farmId}/${kind}${qs(params)}`)),
  create: (kind, farmId, body) => unwrap(http.post(`/farms/${farmId}/${kind}`, body)),
  remove: (kind, farmId, recordId) => unwrap(http.delete(`/farms/${farmId}/${kind}/${recordId}`)),
};

export const farmApi = {
  list: (params) => unwrap(http.get(`/farms${qs(params)}`)),
  get: (id) => unwrap(http.get(`/farms/${id}`)),
  create: (body) => unwrap(http.post('/farms', body)),
  update: (id, body) => unwrap(http.patch(`/farms/${id}`, body)),
  cycles: (id) => unwrap(http.get(`/farms/${id}/cycles`)),
  startCycle: (id, body) => unwrap(http.post(`/farms/${id}/cycles`, body)),
  updateCycle: (id, cycleId, body) => unwrap(http.patch(`/farms/${id}/cycles/${cycleId}`, body)),
  observations: (id, params) => unwrap(http.get(`/farms/${id}/observations${qs(params)}`)),
  addObservation: (id, body) => unwrap(http.post(`/farms/${id}/observations`, body)),
  harvests: (id) => unwrap(http.get(`/farms/${id}/harvests`)),
  addHarvest: (id, body) => unwrap(http.post(`/farms/${id}/harvests`, body)),
  losses: (id) => unwrap(http.get(`/farms/${id}/losses`)),
  addLoss: (id, body) => unwrap(http.post(`/farms/${id}/losses`, body)),
  risks: (id) => unwrap(http.get(`/farms/${id}/risks`)),
  intelligence: (id) => unwrap(http.get(`/farms/${id}/intelligence`)),
  runRisks: (id) => unwrap(http.post(`/farms/${id}/risks/run`)),
  riskHistory: (id, params) => unwrap(http.get(`/farms/${id}/risks/history${qs(params)}`)),
  recommendations: (id, params) => unwrap(http.get(`/farms/${id}/recommendations${qs(params)}`)),
  updateRecommendation: (id, recId, status) => unwrap(http.patch(`/farms/${id}/recommendations/${recId}`, { status })),
  actions: (id) => unwrap(http.get(`/farms/${id}/actions`)),
  addAction: (id, body) => unwrap(http.post(`/farms/${id}/actions`, body)),
  outcomes: (id) => unwrap(http.get(`/farms/${id}/outcomes`)),
  addOutcome: (id, body) => unwrap(http.post(`/farms/${id}/outcomes`, body)),
  history: (id) => unwrap(http.get(`/farms/${id}/history`)),
  environment: (id, params) => unwrap(http.get(`/farms/${id}/environment${qs(params)}`)),
  outlook: (id) => unwrap(http.get(`/farms/${id}/outlook`)),
  alerts: (id, params) => unwrap(http.get(`/farms/${id}/alerts${qs(params)}`)),
  notes: (id) => unwrap(http.get(`/farms/${id}/notes`)),
  addNote: (id, body) => unwrap(http.post(`/farms/${id}/notes`, body)),
  prediction: (predictionId) => unwrap(http.get(`/farms/predictions/${predictionId}`)),
};

export const environmentApi = {
  current: (farmId) => unwrap(http.get(`/environment/current${qs({ farmId })}`)),
  history: (farmId, days) => unwrap(http.get(`/environment/history${qs({ farmId, days })}`)),
  providers: () => unwrap(http.get('/environment/providers')),
};

export const riskApi = {
  /** Without overrides = real run; with overrides = SIMULATION (stored and labelled as such). */
  predict: (farmId, overrides) => unwrap(http.post('/risk/predict', { farmId, ...(overrides ? { overrides } : {}) })),
  forFarm: (farmId) => unwrap(http.get(`/risk/${farmId}`)),
  flag: (predictionId, body) => unwrap(http.post(`/risk/predictions/${predictionId}/flag`, body)),
};

export const actionApi = {
  list: (params) => unwrap(http.get(`/actions${qs(params)}`)),
  get: (id) => unwrap(http.get(`/actions/${id}`)),
  create: (body) => unwrap(http.post('/actions', body)),
  update: (id, body) => unwrap(http.patch(`/actions/${id}`, body)),
  validate: (id, validated, note) => unwrap(http.post(`/actions/${id}/validate`, { validated, note })),
};

export const alertApi = {
  list: (params) => unwrap(http.get(`/alerts${qs(params)}`)),
  update: (id, status) => unwrap(http.patch(`/alerts/${id}`, { status })),
};

export const notificationApi = {
  list: (params) => unwrap(http.get(`/notifications${qs(params)}`)),
  read: (id) => unwrap(http.patch(`/notifications/${id}/read`)),
  readAll: () => unwrap(http.post('/notifications/read-all')),
};

export const cooperativeApi = {
  list: () => unwrap(http.get('/cooperatives')),
  create: (body) => unwrap(http.post('/cooperatives', body)),
  update: (id, body) => unwrap(http.patch(`/cooperatives/${id}`, body)),
  myDashboard: () => unwrap(http.get('/cooperatives/mine/dashboard')),
  dashboard: (id) => unwrap(http.get(`/cooperatives/${id}/dashboard`)),
  farmers: (id) => unwrap(http.get(`/cooperatives/${id}/farmers`)),
};

export const extensionApi = {
  dashboard: () => unwrap(http.get('/extension/dashboard')),
  observations: (params) => unwrap(http.get(`/extension/observations${qs(params)}`)),
  reviewObservation: (id, status, note) => unwrap(http.patch(`/extension/observations/${id}/review`, { status, note })),
  recommendations: (params) => unwrap(http.get(`/extension/recommendations${qs(params)}`)),
  reviewRecommendation: (id, status, note) => unwrap(http.patch(`/extension/recommendations/${id}/review`, { status, note })),
};

export const forecastApi = {
  harvest: (params) => unwrap(http.get(`/forecasts/harvest${qs(params)}`)),
  generate: () => unwrap(http.post('/forecasts/harvest/generate')),
};

export const aiApi = {
  chat: (message, farmId, language) => unwrap(http.post('/ai/chat', { message, farmId, language })),
  status: () => unwrap(http.get('/ai/status')),
};

export const uploadApi = {
  image: (file) => {
    const fd = new FormData();
    fd.append('image', file);
    return unwrap(http.post('/uploads', fd));
  },
  /** Images are protected — fetch as a blob with the auth header, return an object URL. */
  imageUrl: async (id) => URL.createObjectURL((await http.get(`/uploads/${id}`, { responseType: 'blob' })).data),
};

export const adminApi = {
  dashboard: () => unwrap(http.get('/admin/dashboard')),
  users: (params) => unwrap(http.get(`/admin/users${qs(params)}`)),
  createUser: (body) => unwrap(http.post('/admin/users', body)),
  updateUser: (id, body) => unwrap(http.patch(`/admin/users/${id}`, body)),
  roles: () => unwrap(http.get('/admin/roles')),
  settings: () => unwrap(http.get('/admin/settings')),
  updateSetting: (key, value) => unwrap(http.put(`/admin/settings/${key}`, { value })),
  models: () => unwrap(http.get('/admin/models')),
  updateModel: (id, status) => unwrap(http.patch(`/admin/models/${id}`, { status })),
  audit: (params) => unwrap(http.get(`/admin/audit${qs(params)}`)),
  jobs: () => unwrap(http.get('/admin/jobs')),
  runJob: (name) => unwrap(http.post(`/admin/jobs/${name}/run`)),
  notificationLogs: () => unwrap(http.get('/admin/notification-logs')),
  africasTalking: () => unwrap(http.get('/admin/integrations/africastalking')),
  testSms: (phone, message) => unwrap(http.post('/admin/integrations/africastalking/test-sms', { phone, ...(message ? { message } : {}) })),
  publicTokens: () => unwrap(http.get('/admin/public-tokens')),
  issuePublicToken: (body) => unwrap(http.post('/admin/public-tokens', body)),
  revokePublicToken: (id) => unwrap(http.delete(`/admin/public-tokens/${id}`)),
  tmaBulletin: () => unwrap(http.get('/admin/tma-bulletin')),
  saveTmaBulletin: (bulletin) => unwrap(http.put('/admin/tma-bulletin', { bulletin })),
};

export const dashboardApi = {
  impact: (params) => unwrap(http.get(`/dashboard/impact${qs(params)}`)),
};

/** No auth header is attached — the token travels in the query string so bookmarked links Just Work. */
export const partnerApi = {
  forecasts: (token) => unwrap(http.get(`/public/forecasts${qs({ token })}`)),
  adoption: (token) => unwrap(http.get(`/public/adoption${qs({ token })}`)),
};
