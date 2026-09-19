import { useEffect, useState } from 'react';
import { getJob, type DownloadVariant, type Job } from '../api';
import { downloadImage } from '../download';
import { startPolling } from '../poll';
import { Button } from './ui/Button';
import { Panel } from './ui/Panel';

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
  const [downloadError, setDownloadError] = useState<string | null>(null);

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

  async function handleDownload(imageId: string, variant: DownloadVariant): Promise<void> {
    try {
      setDownloadError(null);
      await downloadImage(imageId, variant);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Could not start the download');
    }
  }

  if (error !== null) {
    return (
      <Panel eyebrow="Result" title="Transform job" accentTop>
        <p className="notice">{error}</p>
      </Panel>
    );
  }

  return (
    <Panel
      eyebrow="Result"
      title="Transform job"
      accentTop
      actions={job !== null ? <p className="small-caps">{job.status}</p> : undefined}
    >
      {job === null ? (
        <p className="status">Waiting for the first update...</p>
      ) : (
        <div className="group">
          <p className="status">
            <code className="mono">{job.id.slice(0, 8)}</code>
            {job.attempts > 0 ? ` - attempt ${job.attempts}` : ''}
          </p>

          <div className="progress">
            <div className="progress-bar" style={{ width: `${PROGRESS[job.status]}%` }} />
          </div>

          {job.error !== null && <p className="notice">{job.error}</p>}

          {job.processedUrl !== null && (
            <div className="group">
              {job.width !== null && job.height !== null && (
                <p className="dimensions">
                  {job.width} &times; {job.height}
                </p>
              )}

              <img className="preview" src={job.processedUrl} alt="Transformed result" />

              <div className="actions">
                <Button
                  variant="ghost"
                  onClick={() => void handleDownload(job.imageId, 'processed')}
                >
                  Download result
                </Button>
              </div>
            </div>
          )}

          {downloadError !== null && <p className="notice">{downloadError}</p>}
        </div>
      )}
    </Panel>
  );
}
