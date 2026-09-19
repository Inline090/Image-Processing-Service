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

export const transformRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError('Too many transformation requests, please try again later', 429));
  },
});

// Its own limiter, deliberately not sharing the auth budget: creating a guest
// writes a row and hashes a password, so it deserves a tighter cap and a counter
// that cannot be spent by ordinary sign-in attempts. Ten guest accounts per IP
// per window, each capped at the guest upload limit, bounds anonymous uploads.
export const guestRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError('Too many guest sessions, please try again later', 429));
  },
});
