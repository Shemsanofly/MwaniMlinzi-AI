import { defineRoute } from './defineRoute.js';
import { limiters } from './rateLimit.js';
import { notFoundResponse, toErrorResponse } from './errors.js';
import { preflight, applyCors, applySecurityHeaders } from './headers.js';
import { createContext } from './context.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { uploadSingle } from '../middleware/upload.js';
import * as s from '../validators/schemas.js';
import * as authC from '../controllers/authController.js';
import * as farm from '../controllers/farmController.js';
import * as core from '../controllers/coreController.js';
import * as dash from '../controllers/dashboardController.js';
import * as admin from '../controllers/adminController.js';
import * as pub from '../controllers/publicController.js';
import * as integrations from '../controllers/integrationController.js';
import * as sarufi from '../controllers/sarufiController.js';

const API = [limiters.api];
const AUTH = [limiters.api, authenticate];
const INT = [limiters.integration];
const STAFF = ['ADMIN'];
const farmViewers = authorize('FARMER', 'ADMIN');
const recorders = authorize('FARMER', 'ADMIN');
const ADMIN = [...AUTH, authorize('ADMIN')];

const r = (method, pattern, steps, controller) => ({ method, pattern, steps, controller });

export const ROUTES = [
  // Public
  r('GET', '/health', API, core.health),
  r('GET', '/species', API, core.species),
  r('GET', '/cooperatives/public', API, core.publicCooperatives),
  // Signed-token exports for buyers/processors (forecasts) and programmes/NGOs (adoption).
  r('GET', '/public/forecasts', API, pub.forecasts),
  r('GET', '/public/adoption', API, pub.adoption),

  // Auth
  r('POST', '/auth/register', [...API, limiters.auth, validate(s.registerSchema)], authC.register),
  r('POST', '/auth/login', [...API, limiters.auth, validate(s.loginSchema)], authC.login),
  r('GET', '/auth/me', AUTH, authC.me),
  r('PATCH', '/auth/me', [...AUTH, validate(s.profileSchema, 'body', { partial: true })], authC.updateMe),
  r('POST', '/auth/change-password', [...API, limiters.auth, authenticate, validate(s.changePasswordSchema)], authC.changePassword),
  r('POST', '/auth/logout', AUTH, authC.logout),
  r('POST', '/auth/forgot-password', [...API, limiters.auth, validate(s.forgotPasswordSchema)], authC.forgotPassword),
  r('POST', '/auth/reset-password', [...API, limiters.auth, validate(s.resetPasswordSchema)], authC.resetPassword),

  // Farms: owners see their own farms; administrators see all farms.
  r('GET', '/farms', [...AUTH, farmViewers], farm.listFarms),
  r('POST', '/farms', [...AUTH, authorize('FARMER', 'ADMIN'), validate(s.farmSchema)], farm.createFarm),
  r('GET', '/farms/predictions/:predictionId', [...AUTH, farmViewers], farm.latestPrediction),
  r('GET', '/farms/:id', [...AUTH, farmViewers], farm.getFarm),
  r('PATCH', '/farms/:id', [...AUTH, recorders, validate(s.farmUpdateSchema, 'body', { partial: true })], farm.updateFarm),
  r('GET', '/farms/:id/cycles', [...AUTH, farmViewers], farm.listCycles),
  r('POST', '/farms/:id/cycles', [...AUTH, recorders, validate(s.cycleSchema)], farm.createCycle),
  r('PATCH', '/farms/:id/cycles/:cycleId', [...AUTH, recorders, validate(s.cycleUpdateSchema)], farm.updateCycle),
  r('GET', '/farms/:id/observations', [...AUTH, farmViewers], farm.listObservations),
  r('POST', '/farms/:id/observations', [...AUTH, recorders, validate(s.observationSchema)], farm.createObservation),
  r('GET', '/farms/:id/harvests', [...AUTH, farmViewers], farm.listHarvests),
  r('POST', '/farms/:id/harvests', [...AUTH, recorders, validate(s.harvestSchema)], farm.createHarvest),
  r('GET', '/farms/:id/losses', [...AUTH, farmViewers], farm.listLosses),
  r('POST', '/farms/:id/losses', [...AUTH, recorders, validate(s.lossSchema)], farm.createLoss),
  r('GET', '/farms/:id/records/summary', [...AUTH, farmViewers], farm.recordSummary),
  ...[['sales', s.saleSchema], ['costs', s.costSchema], ['work', s.workSchema]].flatMap(([kind, schema]) => [
    r('GET', `/farms/:id/${kind}`, [...AUTH, farmViewers], farm.listRecords(kind)),
    r('POST', `/farms/:id/${kind}`, [...AUTH, recorders, validate(schema)], farm.createRecord(kind)),
    r('DELETE', `/farms/:id/${kind}/:recordId`, [...AUTH, recorders], farm.deleteRecord(kind)),
  ]),
  r('GET', '/farms/:id/risks', [...AUTH, farmViewers], farm.getRisks),
  r('GET', '/farms/:id/intelligence', [...AUTH, farmViewers], farm.farmIntelligence),
  r('POST', '/farms/:id/risks/run', [...AUTH, farmViewers], farm.runRisks),
  r('GET', '/farms/:id/risks/history', [...AUTH, farmViewers], farm.riskHistory),
  r('GET', '/farms/:id/recommendations', [...AUTH, farmViewers], farm.listRecommendations),
  r('PATCH', '/farms/:id/recommendations/:recId', [...AUTH, recorders, validate(s.recommendationUpdateSchema)], farm.updateRecommendation),
  r('GET', '/farms/:id/actions', [...AUTH, farmViewers], farm.listActions),
  r('POST', '/farms/:id/actions', [...AUTH, recorders, validate(s.farmerActionSchema)], farm.createAction),
  r('GET', '/farms/:id/outcomes', [...AUTH, farmViewers], farm.listOutcomes),
  r('POST', '/farms/:id/outcomes', [...AUTH, recorders, validate(s.outcomeSchema)], farm.createOutcome),
  r('GET', '/farms/:id/history', [...AUTH, farmViewers], farm.farmHistoryTimeline),
  r('GET', '/farms/:id/environment', [...AUTH, farmViewers], farm.farmEnvironment),
  r('GET', '/farms/:id/outlook', [...AUTH, farmViewers], farm.farmOutlook),
  r('GET', '/farms/:id/alerts', [...AUTH, farmViewers], farm.farmAlerts),
  r('GET', '/farms/:id/notes', [...AUTH, farmViewers], farm.listNotes),
  r('POST', '/farms/:id/notes', [...AUTH, authorize('ADMIN'), validate(s.extensionNoteSchema)], farm.createNote),

  // Everything below requires a valid JWT
  r('GET', '/location/reverse', [...AUTH, authorize('FARMER', 'ADMIN'), limiters.location, validate(s.reverseGeocodeSchema, 'query')], core.reverseGeocode),
  r('GET', '/environment/current', [...AUTH, authorize('FARMER', ...STAFF)], core.environmentCurrent),
  r('GET', '/environment/history', [...AUTH, authorize('FARMER', ...STAFF)], core.environmentHistory),
  r('GET', '/environment/providers', AUTH, core.environmentProviders),
  // What-if planner (overrides on request body) is admin-only; a plain forecast request has no overrides.
  r('POST', '/risk/predict', [...AUTH, authorize('FARMER', ...STAFF), validate(s.simulationSchema)], core.predict),
  r('GET', '/risk/:farmId', [...AUTH, authorize('FARMER', ...STAFF)], core.riskForFarm),
  r('POST', '/risk/predictions/:id/flag', [...AUTH, authorize('ADMIN'), validate(s.flagPredictionSchema)], core.flagPrediction),
  r('GET', '/actions', [...AUTH, authorize(...STAFF, 'FARMER')], admin.listActionLibrary),
  r('GET', '/actions/:id', [...AUTH, authorize(...STAFF, 'FARMER')], admin.getActionLibrary),
  r('POST', '/actions', [...AUTH, authorize('ADMIN'), validate(s.actionLibrarySchema)], admin.createActionLibrary),
  r('PATCH', '/actions/:id', [...AUTH, authorize('ADMIN'), validate(s.actionLibraryUpdateSchema, 'body', { partial: true })], admin.updateActionLibrary),
  r('POST', '/actions/:id/validate', [...AUTH, authorize('ADMIN'), validate(s.actionValidateSchema)], admin.validateActionLibrary),
  r('GET', '/alerts', AUTH, core.listAlerts),
  r('PATCH', '/alerts/:id', [...AUTH, authorize('FARMER', ...STAFF)], core.updateAlert),
  r('GET', '/notifications', AUTH, core.listNotifications),
  r('POST', '/notifications/read-all', AUTH, core.readAllNotifications),
  r('PATCH', '/notifications/:id/read', AUTH, core.readNotification),
  r('GET', '/cooperatives', AUTH, dash.listCooperatives),
  r('POST', '/cooperatives', [...AUTH, authorize('ADMIN'), validate(s.cooperativeSchema)], admin.createCooperative),
  r('PATCH', '/cooperatives/:id', [...AUTH, authorize('ADMIN'), validate(s.cooperativeSchema.partial(), 'body', { partial: true })], admin.updateCooperative),
  r('GET', '/cooperatives/mine/dashboard', [...AUTH, authorize(...STAFF)], dash.myCooperativeDashboard),
  r('GET', '/cooperatives/:id/dashboard', [...AUTH, authorize(...STAFF)], dash.cooperativeDashboard),
  r('GET', '/cooperatives/:id/farmers', [...AUTH, authorize(...STAFF)], dash.cooperativeFarmers),
  // Field operations across cooperatives: administrator access only.
  r('GET', '/extension/dashboard', [...AUTH, authorize(...STAFF)], dash.extensionDashboard),
  r('GET', '/extension/observations', [...AUTH, authorize(...STAFF)], dash.extensionObservations),
  r('PATCH', '/extension/observations/:id/review', [...AUTH, authorize(...STAFF), validate(s.reviewSchema)], dash.reviewObservation),
  r('GET', '/extension/recommendations', [...AUTH, authorize(...STAFF)], dash.extensionRecommendations),
  r('PATCH', '/extension/recommendations/:id/review', [...AUTH, authorize(...STAFF), validate(s.reviewSchema)], dash.reviewRecommendation),
  r('GET', '/forecasts/harvest', [...AUTH, validate(s.forecastQuerySchema, 'query')], core.harvestForecasts),
  r('POST', '/forecasts/harvest/generate', [...AUTH, authorize('ADMIN')], core.generateForecasts),
  // Slide-11 pilot targets, scoped by role.
  r('GET', '/dashboard/impact', [...AUTH, authorize(...STAFF)], dash.impactMetrics),
  r('POST', '/ai/chat', [...AUTH, limiters.ai, validate(s.chatSchema)], core.chat),
  r('GET', '/ai/status', AUTH, core.aiStatus),
  r('POST', '/uploads', [...AUTH, authorize('FARMER', 'ADMIN'), uploadSingle('image')], admin.uploadImage),
  r('GET', '/uploads/:id', AUTH, admin.getUpload),

  // Admin
  r('GET', '/admin/dashboard', ADMIN, dash.adminDashboard),
  r('GET', '/admin/users', ADMIN, admin.listUsers),
  r('POST', '/admin/users', [...ADMIN, validate(s.adminUserCreateSchema)], admin.createUser),
  r('PATCH', '/admin/users/:id', [...ADMIN, validate(s.adminUserUpdateSchema, 'body', { partial: true })], admin.updateUser),
  r('GET', '/admin/roles', ADMIN, admin.listRoles),
  r('GET', '/admin/settings', ADMIN, admin.getSettings),
  r('PUT', '/admin/settings/:key', [...ADMIN, validate(s.settingUpdateSchema)], admin.updateSetting),
  r('GET', '/admin/models', ADMIN, admin.listModels),
  r('PATCH', '/admin/models/:id', [...ADMIN, validate(s.modelStatusSchema)], admin.updateModel),
  r('GET', '/admin/audit', ADMIN, admin.listAudit),
  r('GET', '/admin/jobs', ADMIN, admin.listJobs),
  r('POST', '/admin/jobs/:name/run', ADMIN, admin.runJobNow),
  r('GET', '/admin/notification-logs', ADMIN, admin.notificationLogs),
  r('GET', '/admin/integrations/africastalking', ADMIN, admin.africasTalkingStatus),
  r('POST', '/admin/integrations/africastalking/test-sms', [...ADMIN, validate(s.testSmsSchema)], admin.testSms),
  // Issue, list and revoke signed access tokens for the buyer/NGO public export endpoints.
  r('GET', '/admin/public-tokens', ADMIN, admin.listPublicTokens),
  r('POST', '/admin/public-tokens', [...ADMIN, validate(s.publicAccessTokenCreateSchema)], admin.createPublicToken),
  r('DELETE', '/admin/public-tokens/:id', ADMIN, admin.revokePublicToken),
  r('GET', '/admin/tma-bulletin', ADMIN, admin.getTmaBulletin),
  r('PUT', '/admin/tma-bulletin', ADMIN, admin.putTmaBulletin),

  // External provider callbacks: own limiter + shared secret, not the API limiter.
  r('POST', '/integrations/africastalking/ussd', INT, integrations.ussd),
  r('POST', '/integrations/africastalking/sms', INT, integrations.smsInbound),
  r('POST', '/integrations/africastalking/sms/delivery', INT, integrations.smsDelivery),
  // Sarufi (WhatsApp gateway): the GET is a health probe Sarufi's dashboard hits when you paste the URL.
  r('GET', '/integrations/sarufi/webhook', INT, sarufi.health),
  r('POST', '/integrations/sarufi/webhook', INT, sarufi.webhook),
  r('POST', '/ussd/MwaniMlinzi', INT, integrations.ussd), // AT channel callback alias
];

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const segments = (p) => p.split('/').filter(Boolean);

export const patternToDir = (pattern) => segments(pattern).map((seg) => (seg.startsWith(':') ? `[${seg.slice(1)}]` : seg)).join('/');

/** Matches like Next's App Router: at each level a static segment beats a dynamic one. */
export function matchRoute(pathname) {
  const parts = segments(pathname.replace(/^\/api(?=\/|$)/, ''));
  const patterns = [...new Set(ROUTES.map((x) => x.pattern))].map((p) => ({ p, segs: segments(p) })).filter((x) => x.segs.length === parts.length);
  const score = (segs) => segs.map((seg) => (seg.startsWith(':') ? '1' : '0')).join('');
  const hits = patterns
    .filter(({ segs }) => segs.every((seg, i) => seg.startsWith(':') || seg === parts[i]))
    .sort((a, b) => score(a.segs).localeCompare(score(b.segs)));
  if (!hits.length) return null;
  const { p, segs } = hits[0];
  const params = {};
  segs.forEach((seg, i) => { if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(parts[i]); });
  return { pattern: p, params };
}

/**
 * Express fell through to `api.use(authenticate)` (and `adm.use(authorize('ADMIN'))` for `/api/admin` and below)
 * before its 404 handler, so unknown paths answer 401/403 first. Integration paths passed the integration
 * limiter first, then fell through to the API limiter and authenticate as well.
 */
const fallbackSteps = (path) => [
  ...(path.startsWith('/api/integrations/') ? [limiters.integration] : []),
  ...AUTH,
  ...(/^\/api\/admin(\/|$)/.test(path) ? [authorize('ADMIN')] : []),
];
export async function notFoundHandler(request) {
  const path = new URL(request.url).pathname;
  return defineRoute(fallbackSteps(path), (req) => notFoundResponse(req))(request, {});
}

export function handlersFor(pattern) {
  const handlers = {};
  for (const method of METHODS) {
    const route = ROUTES.find((x) => x.pattern === pattern && x.method === method);
    handlers[method] = route ? defineRoute(route.steps, route.controller) : notFoundHandler;
  }
  handlers.OPTIONS = async (request) => preflight(request);
  return handlers;
}

export { applyCors, applySecurityHeaders, createContext, toErrorResponse };
