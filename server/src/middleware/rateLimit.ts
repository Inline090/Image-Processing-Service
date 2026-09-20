import rateLimit from 'express-rate-limit';
import { MAX_BULK_IMAGES } from '../config.js';
import { AppError } from './error.js';

// How many images one caller may ask to have transformed per window. Shared by both
// transform routes so the two cannot drift apart: the single route spends one per
// request, the bulk route spends a whole batch at once.
const TRANSFORM_IMAGE_BUDGET = 30;

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
  limit: TRANSFORM_IMAGE_BUDGET,
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

// The same image allowance, expressed in batches. Counting one request as one would
// let a caller queue MAX_BULK_IMAGES times the work the transform route allows, which
// is the limit walking out of the door the moment a batch is possible.
export const bulkTransformRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Math.max(1, Math.floor(TRANSFORM_IMAGE_BUDGET / MAX_BULK_IMAGES)),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError('Too many bulk transformation requests, please try again later', 429));
  },
});
