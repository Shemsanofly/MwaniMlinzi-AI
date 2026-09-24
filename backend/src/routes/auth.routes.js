import { Router } from 'express';
import * as c from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { loginSchema, profileSchema, registerSchema } from '../validators/schemas.js';

const r = Router();
r.post('/register', authLimiter, validate(registerSchema), c.register);
r.post('/login', authLimiter, validate(loginSchema), c.login);
r.get('/me', authenticate, c.me);
r.patch('/me', authenticate, validate(profileSchema, 'body', { partial: true }), c.updateMe);
r.post('/logout', authenticate, c.logout);
export default r;
