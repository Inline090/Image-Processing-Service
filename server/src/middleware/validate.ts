import type { NextFunction, Request, Response } from 'express';
import type { ZodError, ZodType } from 'zod';
import { AppError } from './error.js';

export function formatIssues(error: ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
}

// Whitelist validation, so an unknown option is rejected loudly.
export function validateBody(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      next(new AppError(`Invalid request body. ${formatIssues(result.error)}`, 400));
      return;
    }

    req.body = result.data;
    next();
  };
}
