import type { NextFunction, Request, Response } from 'express';
import { fileTypeFromBuffer } from 'file-type';
import multer from 'multer';
import { MAX_BULK_IMAGES } from '../config.js';
import { AppError } from './error.js';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

// The size limit sits on the parser, so an oversized file never reaches memory.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_BULK_IMAGES },
});

function describeMulterError(err: multer.MulterError): AppError {
  const limitMb = MAX_UPLOAD_BYTES / (1024 * 1024);

  switch (err.code) {
    case 'LIMIT_FILE_SIZE':
      return new AppError(`File too large. The limit is ${limitMb} MB`, 413);
    case 'LIMIT_FILE_COUNT':
      return new AppError(`At most ${MAX_BULK_IMAGES} images per upload`, 413);
    case 'LIMIT_UNEXPECTED_FILE':
      return new AppError(
        `Unexpected file field "${err.field}". Send the images as "images".`,
        400,
      );
    default:
      return new AppError(`Upload rejected: ${err.message}`, 400);
  }
}

function handleUpload(err: unknown, next: NextFunction): void {
  if (err instanceof multer.MulterError) {
    next(describeMulterError(err));
    return;
  }

  next(err);
}

export function uploadSingleImage(req: Request, res: Response, next: NextFunction): void {
  upload.single('image')(req, res, (err: unknown) => handleUpload(err, next));
}

export function uploadManyImages(req: Request, res: Response, next: NextFunction): void {
  upload.array('images', MAX_BULK_IMAGES)(req, res, (err: unknown) => handleUpload(err, next));
}

export function multerFiles(req: Request): Express.Multer.File[] {
  return Array.isArray(req.files) ? req.files : [];
}

// Reads the real bytes, because the filename and content type are client input.
async function assertIsImage(file: Express.Multer.File): Promise<void> {
  const detected = await fileTypeFromBuffer(file.buffer);

  if (detected === undefined || !ALLOWED_IMAGE_TYPES.has(detected.mime)) {
    throw new AppError('Unsupported file type. Expected PNG, JPEG, WebP or GIF.', 415);
  }

  file.mimetype = detected.mime;
}

export async function validateImageFile(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const file = req.file;

  if (file === undefined) {
    next(new AppError('No file uploaded. Expected a form field named "image".', 400));
    return;
  }

  try {
    await assertIsImage(file);
    next();
  } catch (err) {
    next(err);
  }
}

export async function validateImageFiles(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const files = multerFiles(req);

  if (files.length === 0) {
    next(new AppError('No files uploaded. Expected a form field named "images".', 400));
    return;
  }

  try {
    for (const file of files) {
      await assertIsImage(file);
    }

    next();
  } catch (err) {
    next(err);
  }
}
