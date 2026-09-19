import { useEffect, useState } from 'react';
import { ArrowDownToLine, ImageDown, RefreshCw, Trash } from 'lucide-react';
import { clearImages, deleteImage, listImages, type DownloadVariant, type Image } from '../api';
import { downloadImage } from '../download';
import { Button } from './ui/Button';
import { Panel } from './ui/Panel';

const PAGE_SIZE = 6;

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
        {images.map((image) => (
          <figure className="cell" key={image.id}>
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
              {image.status} &middot; {Math.round(image.sizeBytes / 1024)} kB
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
        ))}
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
