import { Router } from 'express';
import {
  clearImages,
  downloadImage,
  getImage,
  list,
  removeImage,
  transform,
  transformBulk,
  uploadImage,
} from '../controllers/images.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { bulkTransformRateLimit, transformRateLimit } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validate.js';
import { bulkTransformSchema } from '../schemas/bulk.schema.js';
import { transformSchema } from '../schemas/transform.schema.js';
import { uploadSingleImage, validateImageFile } from '../middleware/upload.js';

export const imagesRouter = Router();

imagesRouter.get('/', requireAuth, list);
imagesRouter.get('/:id', requireAuth, getImage);
imagesRouter.get('/:id/download', requireAuth, downloadImage);
imagesRouter.delete('/', requireAuth, clearImages);
imagesRouter.delete('/:id', requireAuth, removeImage);
imagesRouter.post('/', requireAuth, uploadSingleImage, validateImageFile, uploadImage);

// Declared before the single-image route so neither can ever shadow the other.
imagesRouter.post(
  '/transform-bulk',
  requireAuth,
  bulkTransformRateLimit,
  validateBody(bulkTransformSchema),
  transformBulk,
);
imagesRouter.post(
  '/:id/transform',
  requireAuth,
  transformRateLimit,
  validateBody(transformSchema),
  transform,
);
