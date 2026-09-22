import { Router } from 'express';
import { getBatch, getJob } from '../controllers/jobs.controller.js';
import { requireAuth } from '../middleware/auth.js';

export const jobsRouter = Router();

jobsRouter.get('/batch/:id', requireAuth, getBatch);
jobsRouter.get('/:id', requireAuth, getJob);
