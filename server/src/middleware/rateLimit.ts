import rateLimit from 'express-rate-limit';
import { MAX_BULK_IMAGES } from '../config.js';
import { AppError } from './error.js';

// Measured in images, so a batch of ten costs ten.
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

export const guestRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError('Too many guest sessions, please try again later', 429));
  },
});

export const bulkTransformRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Math.max(1, Math.floor(TRANSFORM_IMAGE_BUDGET / MAX_BULK_IMAGES)),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError('Too many bulk transformation requests, please try again later', 429));
  },
});
