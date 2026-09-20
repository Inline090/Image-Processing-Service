import type { Request, Response } from 'express';
import type { JobStatus } from '../db/types.js';
import { AppError } from '../middleware/error.js';
import { findJobByIdForUser, findJobsByBatchForUser } from '../repositories/jobs.js';
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

/**
 * How a bulk request is getting on, counted from its own jobs.
 *
 * One query rather than one per image: a client showing progress on ten pictures should
 * not have to ask ten times. A batch nobody owns is a 404, the same answer a job
 * somebody else owns gets.
 */
export async function getBatch(req: Request, res: Response): Promise<void> {
  const authUser = req.user;
  if (authUser === undefined) {
    throw new AppError('Not authenticated', 401);
  }

  const batchId = req.params.id;
  if (typeof batchId !== 'string') {
    throw new AppError('Batch id is required', 400);
  }

  const jobs = await findJobsByBatchForUser(batchId, authUser.sub);

  if (jobs.length === 0) {
    throw new AppError('Batch not found', 404);
  }

  const countOf = (status: JobStatus): number =>
    jobs.filter((job) => job.status === status).length;

  res.json({
    batchId,
    total: jobs.length,
    pending: countOf('pending'),
    processing: countOf('processing'),
    ready: countOf('ready'),
    failed: countOf('failed'),
    // What the client is waiting for: every job has finished, either way.
    settled: jobs.every((job) => job.status === 'ready' || job.status === 'failed'),
    jobs: jobs.map((job) => ({
      id: job.id,
      imageId: job.image_id,
      status: job.status,
      progress: PROGRESS_BY_STATUS[job.status],
      attempts: job.attempts,
      error: job.error,
      width: job.width,
      height: job.height,
    })),
  });
}
