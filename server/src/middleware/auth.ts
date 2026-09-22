import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../utils/jwt.js';
import { AppError } from './error.js';

// Reads the bearer token and answers 401 when it is missing or expired.
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');

  if (scheme !== 'Bearer' || !token) {
    next(new AppError('Missing bearer token', 401));
    return;
  }

  try {
    req.user = verifyToken(token);
  } catch {
    next(new AppError('Invalid or expired token', 401));
    return;
  }

  next();
}
