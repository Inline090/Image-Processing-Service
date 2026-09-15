import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { AppError } from './error.js';

export function validateBody(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const details = result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');

      next(new AppError(`Invalid request body - ${details}`, 400));
      return;
    }

    req.body = result.data;
    next();
  };
}
