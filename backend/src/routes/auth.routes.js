import { Router } from 'express';
import * as c from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { changePasswordSchema, forgotPasswordSchema, loginSchema, profileSchema, registerSchema, resetPasswordSchema } from '../validators/schemas.js';

const r = Router();
r.post('/register', authLimiter, validate(registerSchema), c.register);
r.post('/login', authLimiter, validate(loginSchema), c.login);
r.get('/me', authenticate, c.me);
r.patch('/me', authenticate, validate(profileSchema, 'body', { partial: true }), c.updateMe);
r.post('/change-password', authLimiter, authenticate, validate(changePasswordSchema), c.changePassword);
r.post('/logout', authenticate, c.logout);
r.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), c.forgotPassword);
r.post('/reset-password', authLimiter, validate(resetPasswordSchema), c.resetPassword);
export default r;
