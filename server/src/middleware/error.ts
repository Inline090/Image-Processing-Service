import type { NextFunction, Request, Response } from 'express';
import { logger } from '../logger.js';

export class AppError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}

export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
}

// Express only recognises an error handler by its four-argument signature, so `_next` stays.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const statusCode = resolveStatus(err);
  const isServerError = statusCode >= 500;

  if (isServerError) {
    logger.error({ err, method: req.method, path: req.originalUrl }, 'unhandled error');
  } else {
    logger.warn({ err, method: req.method, path: req.originalUrl }, 'request rejected');
  }

  res.status(statusCode).json({
    error: {
      // 5xx messages and stack traces are for the logs, never for the client.
      message: isServerError ? 'Internal server error' : resolveMessage(err),
    },
  });
}

type StatusCarrier = { status?: unknown; statusCode?: unknown };

function resolveStatus(err: unknown): number {
  if (err instanceof AppError) {
    return err.statusCode;
  }

  // body-parser tags its own failures (e.g. malformed JSON) with a 4xx status.
  if (typeof err === 'object' && err !== null) {
    const { status, statusCode } = err as StatusCarrier;
    const candidate = statusCode ?? status;
    if (typeof candidate === 'number' && candidate >= 400 && candidate <= 599) {
      return candidate;
    }
  }

  return 500;
}

function resolveMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed';
}
