import { useEffect, useRef, useState } from 'react';
import { ApiError, getJob, type DownloadVariant, type Job } from '../api';
import { downloadImage } from '../download';
import { startPolling } from '../poll';
import { Button } from './ui/Button';
import { Loader } from './ui/Loader';
import { Panel } from './ui/Panel';

// Ready or failed both mean the card can stop polling.
function isSettled(job: Job): boolean {
  return job.status === 'ready' || job.status === 'failed';
}

type Props = {
  jobId: string;

  onReady?: () => void;

  onMissing?: () => void;
};

export function JobStatus({ jobId, onReady, onMissing }: Props) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const onReadyRef = useRef(onReady);
  const onMissingRef = useRef(onMissing);

  useEffect(() => {
    onReadyRef.current = onReady;
    onMissingRef.current = onMissing;
  }, [onReady, onMissing]);

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
        if (err instanceof ApiError && err.status === 404) {
          onMissingRef.current?.();
          return;
        }

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
      <Panel title="Transform">
        <p className="notice">{error}</p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Transform"
      actions={
        <span className="run-state">
          {(job === null || !isSettled(job)) && <Loader size={16} />}

          <span className="code">{job === null ? 'queued' : job.status}</span>
        </span>
      }
    >
      {job === null ? (
        <p className="status">Waiting for the first update...</p>
      ) : (
        <div className="group">
          <div className="progress">
            <div className="progress-bar" style={{ width: `${job.progress}%` }} />
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
                <img className="preview" src={job.processedUrl} />
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
