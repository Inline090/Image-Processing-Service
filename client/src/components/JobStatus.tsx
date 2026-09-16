import { useEffect, useState } from 'react';
import { getJob, type Job } from '../api';
import { startPolling } from '../poll';

const PROGRESS: Record<Job['status'], number> = {
  pending: 5,
  processing: 50,
  ready: 100,
  failed: 100,
};

function isSettled(job: Job): boolean {
  return job.status === 'ready' || job.status === 'failed';
}

type Props = {
  jobId: string;
};

export function JobStatus({ jobId }: Props) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return startPolling<Job>({
      fetch: () => getJob(jobId),
      isSettled,
      onUpdate: (next) => {
        setJob(next);
        setError(null);
      },
      onError: (err) => {
        setError(err instanceof Error ? err.message : 'Could not load the job');
      },
    });
  }, [jobId]);

  if (error !== null) {
    return (
      <section className="panel">
        <h2>Transform job</h2>
        <p className="error">{error}</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Transform job</h2>

      {job === null ? (
        <p className="status">Waiting for the first update...</p>
      ) : (
        <>
          <p className="status">
            <code>{job.id.slice(0, 8)}</code> - <strong>{job.status}</strong>
            {job.attempts > 0 && ` (attempt ${job.attempts})`}
          </p>

          <div className="progress">
            <div className="progress-bar" style={{ width: `${PROGRESS[job.status]}%` }} />
          </div>

          {job.error !== null && <p className="error">{job.error}</p>}

          {job.processedUrl !== null && (
            <img className="preview" src={job.processedUrl} alt="Transformed result" />
          )}
        </>
      )}
    </section>
  );
}
