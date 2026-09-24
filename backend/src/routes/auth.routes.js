import { Router } from 'express';
import * as c from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { changePasswordSchema, loginSchema, profileSchema, registerSchema } from '../validators/schemas.js';

const r = Router();
r.post('/register', authLimiter, validate(registerSchema), c.register);
r.post('/login', authLimiter, validate(loginSchema), c.login);
r.get('/me', authenticate, c.me);
r.patch('/me', authenticate, validate(profileSchema, 'body', { partial: true }), c.updateMe);
r.post('/change-password', authLimiter, authenticate, validate(changePasswordSchema), c.changePassword);
r.post('/logout', authenticate, c.logout);
export default r;
