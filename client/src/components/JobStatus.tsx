import { useEffect, useRef, useState } from 'react';
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
  /** Fired once when the transform lands, so the history can pick the result up. */
  onReady?: () => void;
};

export function JobStatus({ jobId, onReady }: Props) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Held in a ref so a fresh inline callback from the parent does not restart
  // the poll on every render.
  const onReadyRef = useRef(onReady);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    let announced = false;

    return startPolling<Job>({
      fetch: () => getJob(jobId),
      isSettled,
      onUpdate: (next) => {
        setJob(next);
        setError(null);

        if (next.status === 'ready' && !announced) {
          announced = true;
          onReadyRef.current?.();
        }
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
      <Panel title="Transform job">
        <p className="notice">{error}</p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Transform job"
      actions={job !== null ? <span className="code">{job.status}</span> : undefined}
    >
      {job === null ? (
        <p className="status">Waiting for the first update...</p>
      ) : (
        <div className="group">
          <p className="status tabular">
            <span className="code">{job.id.slice(0, 8)}</span>
            {job.attempts > 0 ? ` - attempt ${job.attempts}` : ''}
          </p>

          <div className="progress">
            <div className="progress-bar" style={{ width: `${PROGRESS[job.status]}%` }} />
          </div>

          {job.error !== null && <p className="notice">{job.error}</p>}

          {job.processedUrl !== null && (
            <div className="group">
              {job.width !== null && job.height !== null && (
                <p className="dimensions tabular">
                  {job.width} &times; {job.height}
                </p>
              )}

              <figure className="figure">
                <img className="preview" src={job.processedUrl} alt="Transformed result" />
                <figcaption className="caption">Transformed output</figcaption>
              </figure>

              <div className="actions">
                <Button
                  variant="outline"
                  onClick={() => void handleDownload(job.imageId, 'processed')}
                  title="Download the transformed image."
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
