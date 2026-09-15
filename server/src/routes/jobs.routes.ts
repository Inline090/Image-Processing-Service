import { Router } from 'express';
import { getJob } from '../controllers/jobs.controller.js';
import { requireAuth } from '../middleware/auth.js';

export const jobsRouter = Router();

jobsRouter.get('/:id', requireAuth, getJob);
