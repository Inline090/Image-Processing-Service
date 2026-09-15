import type { Request, Response } from 'express';
import type { JobStatus } from '../db/types.js';
import { AppError } from '../middleware/error.js';
import { findJobByIdForUser } from '../repositories/jobs.js';
import { signedUrl } from '../storage/s3.js';

const PROGRESS_BY_STATUS: Record<JobStatus, number> = {
  pending: 0,
  processing: 50,
  ready: 100,
  failed: 100,
};

export async function getJob(req: Request, res: Response): Promise<void> {
  const authUser = req.user;
  if (authUser === undefined) {
    throw new AppError('Not authenticated', 401);
  }

  const jobId = req.params.id;
  if (typeof jobId !== 'string') {
    throw new AppError('Job id is required', 400);
  }

  const job = await findJobByIdForUser(jobId, authUser.sub);
  if (job === null) {
    throw new AppError('Job not found', 404);
  }

  res.json({
    job: {
      id: job.id,
      imageId: job.image_id,
      status: job.status,
      progress: PROGRESS_BY_STATUS[job.status],
      attempts: job.attempts,
      error: job.error,
      format: job.format,
      width: job.width,
      height: job.height,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
      processedUrl: job.processed_key === null ? null : await signedUrl(job.processed_key),
    },
  });
}
