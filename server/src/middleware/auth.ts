import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../utils/jwt.js';
import { AppError } from './error.js';

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
