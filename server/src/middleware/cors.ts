import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';

const ALLOWED_HEADERS = 'Authorization, Content-Type';
const ALLOWED_METHODS = 'GET, POST, DELETE, OPTIONS';

// The browser asks permission before sending a request to another address, so the
// API has to answer that question. Only the origins named in CORS_ORIGINS are
// allowed: an empty list allows nobody, which is what a same-origin deployment
// wants, so the safe case is the default one.
export function cors(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;

  if (origin !== undefined && config.corsOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    // The answer depends on who asked, so a cache must not reuse it for others.
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
    res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
    res.setHeader('Access-Control-Max-Age', '600');
  }

  // The browser's first question carries no request, and it wants a bare success
  // rather than a body.
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
}
