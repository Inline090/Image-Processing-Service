import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';

const ALLOWED_HEADERS = 'Authorization, Content-Type';
const ALLOWED_METHODS = 'GET, POST, DELETE, OPTIONS';

// Only the origins listed in CORS_ORIGINS. Empty means same origin only.
export function cors(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;

  if (origin !== undefined && config.corsOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
    res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
    res.setHeader('Access-Control-Max-Age', '600');
  }

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
}
