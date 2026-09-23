import { Router } from 'express';
import multer from 'multer';
import { env } from '../config/env.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { aiLimiter } from '../middleware/rateLimit.js';
import * as s from '../validators/schemas.js';
import * as core from '../controllers/coreController.js';
import * as dash from '../controllers/dashboardController.js';
import * as admin from '../controllers/adminController.js';
import authRoutes from './auth.routes.js';
import farmRoutes from './farm.routes.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
});

const api = Router();
const STAFF = ['COOPERATIVE_ADMIN', 'EXTENSION_OFFICER', 'ADMIN'];

// Public
api.get('/health', core.health);
api.get('/species', core.species);
api.get('/cooperatives/public', core.publicCooperatives);
api.post('/ussd/callback', core.ussdCallback); // live gateway (disabled unless configured)

api.use('/auth', authRoutes);
api.use('/farms', farmRoutes);

// Everything below requires a valid JWT
api.use(authenticate);

api.get('/environment/current', authorize('FARMER', ...STAFF), core.environmentCurrent);
api.get('/environment/history', authorize('FARMER', ...STAFF), core.environmentHistory);
api.get('/environment/providers', core.environmentProviders);

api.post('/risk/predict', authorize('FARMER', ...STAFF), validate(s.simulationSchema), core.predict);
api.get('/risk/:farmId', authorize('FARMER', ...STAFF), core.riskForFarm);
api.post('/risk/predictions/:id/flag', authorize('EXTENSION_OFFICER', 'ADMIN'), validate(s.flagPredictionSchema), core.flagPrediction);

api.get('/actions', authorize(...STAFF, 'FARMER'), admin.listActionLibrary);
api.get('/actions/:id', authorize(...STAFF, 'FARMER'), admin.getActionLibrary);
api.post('/actions', authorize('ADMIN'), validate(s.actionLibrarySchema), admin.createActionLibrary);
api.patch('/actions/:id', authorize('ADMIN'), validate(s.actionLibraryUpdateSchema), admin.updateActionLibrary);
api.post('/actions/:id/validate', authorize('EXTENSION_OFFICER', 'ADMIN'), validate(s.actionValidateSchema), admin.validateActionLibrary);

api.get('/alerts', core.listAlerts);
api.patch('/alerts/:id', authorize('FARMER', ...STAFF), core.updateAlert);

api.get('/notifications', core.listNotifications);
api.post('/notifications/read-all', core.readAllNotifications);
api.patch('/notifications/:id/read', core.readNotification);

api.get('/cooperatives', dash.listCooperatives);
api.post('/cooperatives', authorize('ADMIN'), validate(s.cooperativeSchema), admin.createCooperative);
api.patch('/cooperatives/:id', authorize('ADMIN'), validate(s.cooperativeSchema.partial()), admin.updateCooperative);
api.get('/cooperatives/mine/dashboard', authorize('COOPERATIVE_ADMIN'), dash.myCooperativeDashboard);
api.get('/cooperatives/:id/dashboard', authorize(...STAFF), dash.cooperativeDashboard);
api.get('/cooperatives/:id/farmers', authorize(...STAFF), dash.cooperativeFarmers);

api.get('/extension/dashboard', authorize('EXTENSION_OFFICER', 'ADMIN'), dash.extensionDashboard);
api.get('/extension/observations', authorize('EXTENSION_OFFICER', 'ADMIN'), dash.extensionObservations);
api.patch('/extension/observations/:id/review', authorize('EXTENSION_OFFICER', 'ADMIN'), validate(s.reviewSchema), dash.reviewObservation);
api.get('/extension/recommendations', authorize('EXTENSION_OFFICER', 'ADMIN'), dash.extensionRecommendations);
api.patch('/extension/recommendations/:id/review', authorize('EXTENSION_OFFICER', 'ADMIN'), validate(s.reviewSchema), dash.reviewRecommendation);

api.get('/buyers', core.listBuyers);
api.get('/buyers/forecast', authorize('BUYER', 'COOPERATIVE_ADMIN', 'ADMIN'), validate(s.forecastQuerySchema, 'query'), core.buyerForecast);
api.post('/buyers/demand', authorize('BUYER'), validate(s.demandSchema), core.createDemand);

api.get('/forecasts/harvest', validate(s.forecastQuerySchema, 'query'), core.harvestForecasts);
api.post('/forecasts/harvest/generate', authorize('COOPERATIVE_ADMIN', 'ADMIN'), core.generateForecasts);

api.post('/ai/chat', aiLimiter, validate(s.chatSchema), core.chat);
api.get('/ai/status', core.aiStatus);

api.post('/sms/simulate', validate(s.smsSchema), core.smsSimulate);
api.get('/sms/messages', core.smsMessages);
api.post('/ussd/simulate', validate(s.ussdSchema), core.ussdSimulate);

api.post('/uploads', authorize('FARMER', 'EXTENSION_OFFICER', 'ADMIN'), upload.single('image'), admin.uploadImage);
api.get('/uploads/:id', admin.getUpload);

const adm = Router();
adm.use(authorize('ADMIN'));
adm.get('/dashboard', dash.adminDashboard);
adm.get('/users', admin.listUsers);
adm.post('/users', validate(s.adminUserCreateSchema), admin.createUser);
adm.patch('/users/:id', validate(s.adminUserUpdateSchema), admin.updateUser);
adm.get('/roles', admin.listRoles);
adm.get('/settings', admin.getSettings);
adm.put('/settings/:key', validate(s.settingUpdateSchema), admin.updateSetting);
adm.get('/models', admin.listModels);
adm.patch('/models/:id', validate(s.modelStatusSchema), admin.updateModel);
adm.get('/audit', admin.listAudit);
adm.get('/jobs', admin.listJobs);
adm.post('/jobs/:name/run', admin.runJobNow);
adm.get('/notification-logs', admin.notificationLogs);
api.use('/admin', adm);

export default api;
