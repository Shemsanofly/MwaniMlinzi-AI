import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const make = (windowMs, limit) => rateLimit({
  windowMs,
  limit: env.isTest ? 100000 : limit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down.' } }),
});

export const apiLimiter = make(15 * 60 * 1000, 1500);
export const authLimiter = make(15 * 60 * 1000, 30);
export const aiLimiter = make(60 * 1000, 30);
/** Africa's Talking callbacks: generous (all traffic comes from AT's IPs) but bounded. */
export const integrationLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: env.isTest ? 100000 : 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).type('text/plain').send('END Too many requests. Please try again later.'),
});
