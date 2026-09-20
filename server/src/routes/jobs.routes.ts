import { Router } from 'express';
import { getBatch, getJob } from '../controllers/jobs.controller.js';
import { requireAuth } from '../middleware/auth.js';

export const jobsRouter = Router();

// Declared before the single-job route so neither can shadow the other. `batch` is
// never a job id - those are uuids - so the two paths cannot actually collide.
jobsRouter.get('/batch/:id', requireAuth, getBatch);
jobsRouter.get('/:id', requireAuth, getJob);
