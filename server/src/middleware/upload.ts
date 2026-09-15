import type { NextFunction, Request, Response } from 'express';
import { fileTypeFromBuffer } from 'file-type';
import multer from 'multer';
import { AppError } from './error.js';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

export function uploadSingleImage(req: Request, res: Response, next: NextFunction): void {
  upload.single('image')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        const limitMb = MAX_UPLOAD_BYTES / (1024 * 1024);
        next(new AppError(`File too large - the limit is ${limitMb} MB`, 413));
        return;
      }

      next(new AppError(`Upload rejected: ${err.message}`, 400));
      return;
    }

    next(err);
  });
}

export async function validateImageFile(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const file = req.file;

  if (file === undefined) {
    next(new AppError('No file uploaded - expected a form field named "image"', 400));
    return;
  }

  const detected = await fileTypeFromBuffer(file.buffer);

  if (detected === undefined || !ALLOWED_IMAGE_TYPES.has(detected.mime)) {
    next(new AppError('Unsupported file type - expected PNG, JPEG, WebP or GIF', 415));
    return;
  }

  file.mimetype = detected.mime;

  next();
}
