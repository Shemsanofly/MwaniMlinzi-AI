import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import api from './routes/index.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { openApiSpec } from './config/openapi.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || env.corsOrigins.includes(origin)),
    credentials: false,
  }));
  app.use(express.json({ limit: '200kb' }));
  app.use(express.urlencoded({ extended: false, limit: '50kb' })); // USSD gateway callbacks
  if (!env.isTest) {
    // Never write query-string secrets (e.g. the USSD gateway ?key=) to access logs.
    morgan.token('url', (req) => (req.originalUrl || req.url).replace(/([?&](?:key|token|apiKey)=)[^&]*/gi, '$1[REDACTED]'));
    app.use(morgan(env.isProduction ? 'combined' : 'dev'));
  }

  app.get('/', (_req, res) => res.json({ success: true, data: { name: 'MwaniMlinzi AI API', docs: '/api/docs', health: '/api/health' }, message: 'Know the risk. Know the next action.' }));
  app.get('/api/docs.json', (_req, res) => res.json(openApiSpec));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, { customSiteTitle: 'MwaniMlinzi AI API' }));
  app.use('/api', apiLimiter, api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
