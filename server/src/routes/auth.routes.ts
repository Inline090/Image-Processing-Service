import { Router } from 'express';
import { guest, me } from '../controllers/auth.controller.js';
import { finishProvider, startProvider } from '../controllers/oauth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { authRateLimit, guestRateLimit } from '../middleware/rateLimit.js';

export const authRouter = Router();

authRouter.post('/guest', guestRateLimit, guest);
authRouter.get('/me', requireAuth, me);

// A provider sign-in is two full page navigations rather than a request: the browser
// leaves for the provider and comes back, which is why both reply with a redirect.
authRouter.get('/google', authRateLimit, startProvider('google'));
authRouter.get('/google/callback', authRateLimit, finishProvider('google'));

authRouter.get('/facebook', authRateLimit, startProvider('facebook'));
authRouter.get('/facebook/callback', authRateLimit, finishProvider('facebook'));

authRouter.get('/twitter', authRateLimit, startProvider('twitter'));
authRouter.get('/twitter/callback', authRateLimit, finishProvider('twitter'));
