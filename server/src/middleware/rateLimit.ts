import rateLimit from 'express-rate-limit';
import { AppError } from './error.js';

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError('Too many attempts, please try again later', 429));
  },
});
