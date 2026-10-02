import { Router } from 'express';
import multer from 'multer';
import { env } from '../config/env.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { aiLimiter, locationLimiter } from '../middleware/rateLimit.js';
import * as s from '../validators/schemas.js';
import * as core from '../controllers/coreController.js';
import * as dash from '../controllers/dashboardController.js';
import * as admin from '../controllers/adminController.js';
import * as pub from '../controllers/publicController.js';
import authRoutes from './auth.routes.js';
import farmRoutes from './farm.routes.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
});

const api = Router();
// Any staff seat. Fine-grained checks (cooperative scoping, admin-only ops) are enforced per-route below.
const STAFF = ['COOPERATIVE_ADMIN', 'EXTENSION_OFFICER', 'ADMIN'];
// Staff seats that can see across cooperatives (not scoped to a single one).
const CROSS_COOP_STAFF = ['EXTENSION_OFFICER', 'ADMIN'];

// Public
api.get('/health', core.health);
api.get('/species', core.species);
api.get('/cooperatives/public', core.publicCooperatives);

// Signed-token exports for buyers/processors (forecasts) and programmes/NGOs (adoption).
// Auth is the token itself (`?token=…`, `X-Access-Token: …`, or `Authorization: Bearer …`).
api.get('/public/forecasts', pub.forecasts);
api.get('/public/adoption', pub.adoption);

api.use('/auth', authRoutes);
api.use('/farms', farmRoutes);

// Everything below requires a valid JWT
api.use(authenticate);
api.get('/location/reverse', authorize('FARMER', 'ADMIN'), locationLimiter, validate(s.reverseGeocodeSchema, 'query'), core.reverseGeocode);

api.get('/environment/current', authorize('FARMER', ...STAFF), core.environmentCurrent);
api.get('/environment/history', authorize('FARMER', ...STAFF), core.environmentHistory);
api.get('/environment/providers', core.environmentProviders);

// What-if planner (overrides on request body) is admin-only; a plain forecast request has no overrides.
api.post('/risk/predict', authorize('FARMER', ...STAFF), validate(s.simulationSchema), core.predict);
api.get('/risk/:farmId', authorize('FARMER', ...STAFF), core.riskForFarm);
api.post('/risk/predictions/:id/flag', authorize('ADMIN'), validate(s.flagPredictionSchema), core.flagPrediction);

api.get('/actions', authorize(...STAFF, 'FARMER'), admin.listActionLibrary);
api.get('/actions/:id', authorize(...STAFF, 'FARMER'), admin.getActionLibrary);
api.post('/actions', authorize('ADMIN'), validate(s.actionLibrarySchema), admin.createActionLibrary);
api.patch('/actions/:id', authorize('ADMIN'), validate(s.actionLibraryUpdateSchema, 'body', { partial: true }), admin.updateActionLibrary);
api.post('/actions/:id/validate', authorize('ADMIN'), validate(s.actionValidateSchema), admin.validateActionLibrary);

api.get('/alerts', core.listAlerts);
api.patch('/alerts/:id', authorize('FARMER', ...STAFF), core.updateAlert);

api.get('/notifications', core.listNotifications);
api.post('/notifications/read-all', core.readAllNotifications);
api.patch('/notifications/:id/read', core.readNotification);

api.get('/cooperatives', dash.listCooperatives);
api.post('/cooperatives', authorize('ADMIN'), validate(s.cooperativeSchema), admin.createCooperative);
api.patch('/cooperatives/:id', authorize('ADMIN'), validate(s.cooperativeSchema.partial(), 'body', { partial: true }), admin.updateCooperative);
api.get('/cooperatives/mine/dashboard', authorize(...STAFF), dash.myCooperativeDashboard);
api.get('/cooperatives/:id/dashboard', authorize(...STAFF), dash.cooperativeDashboard);
api.get('/cooperatives/:id/farmers', authorize(...STAFF), dash.cooperativeFarmers);

// Extension-wide operations: observable to extension officers and admins across cooperatives.
api.get('/extension/dashboard', authorize(...CROSS_COOP_STAFF), dash.extensionDashboard);
api.get('/extension/observations', authorize(...CROSS_COOP_STAFF), dash.extensionObservations);
api.patch('/extension/observations/:id/review', authorize(...CROSS_COOP_STAFF), validate(s.reviewSchema), dash.reviewObservation);
api.get('/extension/recommendations', authorize(...CROSS_COOP_STAFF), dash.extensionRecommendations);
api.patch('/extension/recommendations/:id/review', authorize(...CROSS_COOP_STAFF), validate(s.reviewSchema), dash.reviewRecommendation);

api.get('/forecasts/harvest', validate(s.forecastQuerySchema, 'query'), core.harvestForecasts);
api.post('/forecasts/harvest/generate', authorize('ADMIN'), core.generateForecasts);

// Slide-11 pilot targets, scoped by role.
api.get('/dashboard/impact', authorize(...STAFF), dash.impactMetrics);

api.post('/ai/chat', aiLimiter, validate(s.chatSchema), core.chat);
api.get('/ai/status', core.aiStatus);

api.post('/uploads', authorize('FARMER', 'ADMIN'), upload.single('image'), admin.uploadImage);
api.get('/uploads/:id', admin.getUpload);

const adm = Router();
adm.use(authorize('ADMIN'));
adm.get('/dashboard', dash.adminDashboard);
adm.get('/users', admin.listUsers);
adm.post('/users', validate(s.adminUserCreateSchema), admin.createUser);
adm.patch('/users/:id', validate(s.adminUserUpdateSchema, 'body', { partial: true }), admin.updateUser);
adm.get('/roles', admin.listRoles);
adm.get('/settings', admin.getSettings);
adm.put('/settings/:key', validate(s.settingUpdateSchema), admin.updateSetting);
adm.get('/models', admin.listModels);
adm.patch('/models/:id', validate(s.modelStatusSchema), admin.updateModel);
adm.get('/audit', admin.listAudit);
adm.get('/jobs', admin.listJobs);
adm.post('/jobs/:name/run', admin.runJobNow);
adm.get('/notification-logs', admin.notificationLogs);
adm.get('/integrations/africastalking', admin.africasTalkingStatus);
adm.post('/integrations/africastalking/test-sms', validate(s.testSmsSchema), admin.testSms);
// Issue, list and revoke signed access tokens for the buyer/NGO public export endpoints.
adm.get('/public-tokens', admin.listPublicTokens);
adm.post('/public-tokens', validate(s.publicAccessTokenCreateSchema), admin.createPublicToken);
adm.delete('/public-tokens/:id', admin.revokePublicToken);
adm.get('/tma-bulletin', admin.getTmaBulletin);
adm.put('/tma-bulletin', admin.putTmaBulletin);
api.use('/admin', adm);

export default api;
