import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../utils/jwt.js';

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = (header as string).split(' ')[1];

  req.user = verifyToken(token as string);

  next();
}
