import { useEffect, useState } from 'react';
import { ArrowDownToLine, ImageDown, RefreshCw, Trash } from 'lucide-react';
import {
  clearImages,
  deleteImage,
  getBatch,
  listImages,
  transformBulk,
  type Batch,
  type BatchJob,
  type DownloadVariant,
  type Image,
} from '../api';
import { downloadImage } from '../download';
import { startPolling } from '../poll';
import { Button } from './ui/Button';
import { Panel } from './ui/Panel';

const PAGE_SIZE = 6;
const FORMATS = ['webp', 'jpeg', 'png'] as const;

// A sentinel for "every image", distinguished from an image id.
const ALL = 'all';

// The parent remounts this panel (a changing `key`) when a transform lands, which
// resets the page to one and re-runs the fetch below. Newest-first means page one
// is where a fresh result appears.
export function GalleryPanel() {
  const [page, setPage] = useState(1);
  const [reloads, setReloads] = useState(0);
  const [images, setImages] = useState<Image[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The bulk selection, and the batch it started.
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkWidth, setBulkWidth] = useState('400');
  const [bulkFormat, setBulkFormat] = useState<(typeof FORMATS)[number]>('webp');
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);

  useEffect(() => {
    let cancelled = false;

    listImages(page, PAGE_SIZE)
      .then((result) => {
        if (cancelled) {
          return;
        }

        setImages(result.images);
        setTotalPages(result.totalPages);
        setTotal(result.total);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }

        setError(err instanceof Error ? err.message : 'Could not load your history');
      });

    return () => {
      cancelled = true;
    };
  }, [page, reloads]);

  // Polling the batch rather than each job: one request covers every image in it, and
  // it stops as soon as the server says the whole batch has settled.
  useEffect(() => {
    if (batchId === null) {
      return;
    }

    return startPolling<Batch>({
      fetch: () => getBatch(batchId),
      isSettled: (value) => value.settled,
      onUpdate: (value) => {
        setBatch(value);
        setError(null);

        if (value.settled) {
          setReloads((current) => current + 1);
        }
      },
      onError: (err) => {
        setError(err instanceof Error ? err.message : 'Could not load the batch');
      },
    });
  }, [batchId]);

  function toggleSelected(id: string): void {
    setSelected(selected.includes(id) ? selected.filter((each) => each !== id) : [...selected, id]);
  }

  async function handleBulk(): Promise<void> {
    if (selected.length === 0) {
      return;
    }

    setBusy(true);

    try {
      const result = await transformBulk(selected, {
        width: Number(bulkWidth),
        format: bulkFormat,
      });

      setError(null);
      setSelected([]);
      setBatch(null);

      // Nothing was queued, so there is nothing to poll - the results already exist.
      if (result.queued === 0) {
        setReloads(reloads + 1);
        return;
      }

      setBatchId(result.batchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not queue the transformations');
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload(imageId: string, variant: DownloadVariant): Promise<void> {
    try {
      setError(null);
      await downloadImage(imageId, variant);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the download');
    }
  }

  // Stepping back a page keeps the view from landing on an emptied page.
  function afterDelete(removed: number): void {
    setConfirming(null);

    if (images.length - removed <= 0 && page > 1) {
      setPage(page - 1);
      return;
    }

    setReloads(reloads + 1);
  }

  async function handleDelete(id: string): Promise<void> {
    setBusy(true);

    try {
      await deleteImage(id);
      setError(null);
      setSelected(selected.filter((each) => each !== id));
      afterDelete(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the image');
      setConfirming(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleClear(): Promise<void> {
    setBusy(true);

    try {
      await clearImages();
      setError(null);
      setConfirming(null);
      setImages([]);
      setTotal(0);
      setSelected([]);
      setBatch(null);
      setBatchId(null);

      if (page !== 1) {
        setPage(1);
      } else {
        setReloads(reloads + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not clear the history');
      setConfirming(null);
    } finally {
      setBusy(false);
    }
  }

  const byImage = new Map<string, BatchJob>((batch?.jobs ?? []).map((job) => [job.imageId, job]));

  return (
    <Panel
      title="History"
      actions={
        <div className="actions">
          {total > 0 && (
            <Button
              variant="link"
              onClick={() => setConfirming(ALL)}
              title="Delete every image in your history."
            >
              Clear all
            </Button>
          )}

          <button
            type="button"
            className="icon-btn"
            aria-label="Refresh history"
            title="Reload your history."
            onClick={() => setReloads(reloads + 1)}
          >
            <RefreshCw size={16} strokeWidth={2} />
          </button>
        </div>
      }
    >
      {error !== null && <p className="notice">{error}</p>}

      {selected.length > 0 && (
        <div className="bulk">
          <p className="label">{selected.length} selected</p>

          <div className="pairs">
            <label>
              Width
              <input
                type="number"
                min="1"
                max="4096"
                value={bulkWidth}
                onChange={(event) => setBulkWidth(event.target.value)}
              />
            </label>

            <label>
              Format
              <select
                value={bulkFormat}
                onChange={(event) => setBulkFormat(event.target.value as (typeof FORMATS)[number])}
              >
                {FORMATS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="actions">
            <Button variant="primary" disabled={busy} onClick={() => void handleBulk()}>
              {busy ? 'Queueing...' : `Transform ${selected.length}`}
            </Button>

            <Button variant="ghost" disabled={busy} onClick={() => setSelected([])}>
              Clear selection
            </Button>
          </div>
        </div>
      )}

      {batch !== null && (
        <p className="status">
          Batch <code>{batch.batchId.slice(0, 8)}</code>: {batch.ready} ready,{' '}
          {batch.processing + batch.pending} working, {batch.failed} failed of {batch.total}
        </p>
      )}

      {confirming !== null && (
        <div className="confirm">
          <p className="confirm-text">
            {confirming === ALL
              ? `Delete all ${total} images from your history? This cannot be undone.`
              : 'Delete this image? This cannot be undone.'}
          </p>

          <div className="actions">
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => void (confirming === ALL ? handleClear() : handleDelete(confirming))}
            >
              {busy ? 'Deleting...' : 'Delete'}
            </Button>

            <Button variant="ghost" disabled={busy} onClick={() => setConfirming(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {images.length === 0 && error === null && (
        <p className="prose">Nothing here yet. Transformed images will appear here.</p>
      )}

      <div className="grid">
        {images.map((image) => {
          const job = byImage.get(image.id);

          return (
            <figure className="cell" key={image.id}>
              <label className="pick">
                <input
                  type="checkbox"
                  aria-label="Select this image"
                  checked={selected.includes(image.id)}
                  onChange={() => toggleSelected(image.id)}
                />
              </label>

              <img
                className="thumb"
                src={image.processedUrl ?? image.originalUrl}
                alt=""
                title={
                  image.processedUrl === null
                    ? 'Transformed result is not ready yet, showing the original.'
                    : 'Transformed result.'
                }
              />

              <figcaption className="caption tabular">
                {job === undefined ? image.status : `${job.status} ${job.progress}%`} &middot;{' '}
                {Math.round(image.sizeBytes / 1024)} kB
              </figcaption>

              <div className="cell-actions">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Download the original"
                  title="Download the image exactly as you uploaded it."
                  onClick={() => void handleDownload(image.id, 'original')}
                >
                  <ArrowDownToLine size={16} strokeWidth={2} />
                </button>

                {image.processedUrl !== null && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Download the transformed result"
                    title="Download the transformed result."
                    onClick={() => void handleDownload(image.id, 'processed')}
                  >
                    <ImageDown size={16} strokeWidth={2} />
                  </button>
                )}

                <button
                  type="button"
                  className="icon-btn icon-btn--danger"
                  aria-label="Remove from history"
                  title="Remove this image from your history."
                  onClick={() => setConfirming(image.id)}
                >
                  <Trash size={16} strokeWidth={2} />
                </button>
              </div>
            </figure>
          );
        })}
      </div>

      {total > PAGE_SIZE && (
        <div className="pager">
          <Button
            variant="outline"
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
            title="Show the previous page of your history."
          >
            Previous
          </Button>

          <span className="label">
            Page {page} of {totalPages}
          </span>

          <Button
            variant="outline"
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages}
            title="Show the next page of your history."
          >
            Next
          </Button>
        </div>
      )}
    </Panel>
  );
}
