import { Router } from 'express';
import { uploadImage } from '../controllers/images.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadSingleImage } from '../middleware/upload.js';

export const imagesRouter = Router();

imagesRouter.post('/', requireAuth, uploadSingleImage, uploadImage);
