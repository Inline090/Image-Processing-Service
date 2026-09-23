import { Router } from 'express';
import { me, startEmailSignIn, verifyEmailSignIn } from '../controllers/auth.controller.js';
import { finishProvider, startProvider } from '../controllers/oauth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { authRateLimit } from '../middleware/rateLimit.js';

export const authRouter = Router();

authRouter.post('/email/start', authRateLimit, startEmailSignIn);
authRouter.get('/email/verify', authRateLimit, verifyEmailSignIn);

authRouter.get('/me', requireAuth, me);

authRouter.get('/google', authRateLimit, startProvider('google'));
authRouter.get('/google/callback', authRateLimit, finishProvider('google'));

authRouter.get('/facebook', authRateLimit, startProvider('facebook'));
authRouter.get('/facebook/callback', authRateLimit, finishProvider('facebook'));

authRouter.get('/twitter', authRateLimit, startProvider('twitter'));
authRouter.get('/twitter/callback', authRateLimit, finishProvider('twitter'));
