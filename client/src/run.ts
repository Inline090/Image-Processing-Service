import { getBatch, getJob, type Job } from './api';

export type TransformRun =
  | { kind: 'batch'; batchId: string }
  | { kind: 'jobs'; jobIds: string[] };

function isSettledStatus(status: Job['status']): boolean {
  return status === 'ready' || status === 'failed';
}

// A run is settled when its batch, or every one of its jobs, has finished.
export async function isRunSettled(run: TransformRun): Promise<boolean> {
  if (run.kind === 'batch') {
    const batch = await getBatch(run.batchId);

    return batch.settled;
  }

  const jobs = await Promise.all(run.jobIds.map((id) => getJob(id)));

  return jobs.every((job) => isSettledStatus(job.status));
}
