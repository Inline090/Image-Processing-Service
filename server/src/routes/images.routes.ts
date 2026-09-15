import { Router } from 'express';
import { transform, uploadImage } from '../controllers/images.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { transformRateLimit } from '../middleware/rateLimit.js';
import { uploadSingleImage, validateImageFile } from '../middleware/upload.js';

export const imagesRouter = Router();

imagesRouter.post('/', requireAuth, uploadSingleImage, validateImageFile, uploadImage);
imagesRouter.post('/:id/transform', requireAuth, transformRateLimit, transform);
