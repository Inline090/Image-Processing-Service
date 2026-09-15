import { Router } from 'express';
import { login, me, register } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { authRateLimit } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validate.js';
import { loginSchema, registerSchema } from '../schemas/auth.schema.js';

export const authRouter = Router();

authRouter.post('/register', authRateLimit, validateBody(registerSchema), register);
authRouter.post('/login', authRateLimit, validateBody(loginSchema), login);
authRouter.get('/me', requireAuth, me);
