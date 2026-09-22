import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { listImages, type Image } from '../api';
import { downloadImage } from '../download';
import { Button } from './ui/Button';
import { Loader } from './ui/Loader';
import { Panel } from './ui/Panel';

const LIMIT = 12;

type Props = {
  refreshKey: number;
};

// Newest first, one at a time, with arrows that wrap.
export function ResultsCarousel({ refreshKey }: Props) {
  const [images, setImages] = useState<Image[]>([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    listImages(1, LIMIT)
      .then((result) => {
        if (cancelled) {
          return;
        }

        setImages(result.images);
        setError(null);
        setIndex((current) => (current < result.images.length ? current : 0));
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }

        setError(err instanceof Error ? err.message : 'Could not load your images');
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const current = images[index];

  function step(by: number): void {
    setIndex((current) => (current + by + images.length) % images.length);
  }

  async function handleDownload(imageId: string): Promise<void> {
    try {
      setError(null);
      await downloadImage(imageId, 'processed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the download');
    }
  }

  return (
    <Panel
      title="Your transforms"
      actions={
        <div className="actions">
          {current !== undefined && current.processedUrl !== null && (
            <button
              type="button"
              className="icon-btn"
              title="Download the transformed result."
              onClick={() => void handleDownload(current.id)}
            >
              <ImageDown size={16} strokeWidth={1.5} />
            </button>
          )}

          <Button variant="ghost" onClick={() => navigate('/history')}>
            See all
          </Button>
        </div>
      }
    >
      {error !== null && <p className="notice">{error}</p>}

      {images.length === 0 && error === null && (
        <p className="prose">Transform an image and it will appear here.</p>
      )}

      {current !== undefined && (
        <figure className="carousel">
          <div className="tile-frame">
            <img
              className="carousel-image"
              src={current.processedUrl ?? current.originalUrl}
            />

            {current.status !== 'ready' && (
              <span className="tile-loading">
                <Loader size={18} />
              </span>
            )}
          </div>

          {images.length > 1 && (
            <>
              <button
                type="button"
                className="carousel-arrow carousel-arrow--prev"
                title="The previous one."
                onClick={() => step(-1)}
              >
                <ChevronLeft size={22} strokeWidth={1.5} />
              </button>

              <button
                type="button"
                className="carousel-arrow carousel-arrow--next"
                title="The next one."
                onClick={() => step(1)}
              >
                <ChevronRight size={22} strokeWidth={1.5} />
              </button>
            </>
          )}

          <figcaption className="carousel-caption tabular">
            <span>
              {index + 1} of {images.length}
            </span>
            <span>{current.status}</span>
            <span>{Math.round(current.sizeBytes / 1024)} kB</span>
          </figcaption>
        </figure>
      )}
    </Panel>
  );
}
