import { useEffect, useState } from 'react';
import { listImages, type DownloadVariant, type Image } from '../api';
import { downloadImage } from '../download';

const PAGE_SIZE = 6;

export function GalleryPanel() {
  const [page, setPage] = useState(1);
  const [reloads, setReloads] = useState(0);
  const [images, setImages] = useState<Image[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

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

        setError(err instanceof Error ? err.message : 'Could not load your uploads');
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

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Your uploads</h2>
        <button type="button" className="link" onClick={() => setReloads(reloads + 1)}>
          Refresh
        </button>
      </header>

      {error !== null && <p className="error">{error}</p>}

      {images.length === 0 && error === null && <p className="status">Nothing uploaded yet.</p>}

      <div className="grid">
        {images.map((image) => (
          <article className="card" key={image.id}>
            <img className="thumb" src={image.processedUrl ?? image.originalUrl} alt="Upload" />
            <p className="meta">
              <strong>{image.status}</strong>
              <span>{Math.round(image.sizeBytes / 1024)} kB</span>
            </p>
            <div className="card-actions">
              <button
                type="button"
                className="link"
                onClick={() => void handleDownload(image.id, 'original')}
              >
                Original
              </button>
              {image.processedUrl !== null && (
                <button
                  type="button"
                  className="link"
                  onClick={() => void handleDownload(image.id, 'processed')}
                >
                  Result
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      {total > PAGE_SIZE && (
        <div className="pager">
          <button type="button" onClick={() => setPage(page - 1)} disabled={page <= 1}>
            Previous
          </button>
          <span className="status">
            Page {page} of {totalPages}
          </span>
          <button type="button" onClick={() => setPage(page + 1)} disabled={page >= totalPages}>
            Next
          </button>
        </div>
      )}
    </section>
  );
}
