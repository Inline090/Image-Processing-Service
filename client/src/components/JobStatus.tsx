import { useEffect, useState } from 'react';
import { getJob, type Job } from '../api';

const POLL_INTERVAL_MS = 1000;

const PROGRESS: Record<Job['status'], number> = {
  pending: 5,
  processing: 50,
  ready: 100,
  failed: 100,
};

type Props = {
  jobId: string;
};

export function JobStatus({ jobId }: Props) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      getJob(jobId)
        .then((next) => {
          setJob(next);
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'Could not load the job');
        });
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
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
