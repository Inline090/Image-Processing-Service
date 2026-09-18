import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { transformImage, uploadImage, type Job } from '../api';

const FORMATS = ['webp', 'jpeg', 'png'];

type Props = {
  onJobQueued: (jobId: string) => void;
};

export function UploadPanel({ onJobQueued }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [width, setWidth] = useState('400');
  const [format, setFormat] = useState('webp');
  const [grayscale, setGrayscale] = useState(false);
  const [sepia, setSepia] = useState(false);
  const [watermark, setWatermark] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<Job | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);

  function releasePreview(): void {
    if (preview !== null) {
      URL.revokeObjectURL(preview);
    }

    setPreview(null);
  }

  function clearPickedFile(): void {
    setFile(null);
    releasePreview();

    if (fileInput.current !== null) {
      fileInput.current.value = '';
    }
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>): void {
    const picked = event.target.files?.[0] ?? null;

    releasePreview();
    setFile(picked);
    setJob(null);

    if (picked !== null) {
      setPreview(URL.createObjectURL(picked));
    }
  }

  function buildOptions(): Record<string, unknown> {
    const options: Record<string, unknown> = { format };
    const parsedWidth = Number(width);

    if (Number.isInteger(parsedWidth) && parsedWidth > 0) {
      options.width = parsedWidth;
    }

    if (grayscale) {
      options.grayscale = true;
    }

    if (sepia) {
      options.sepia = true;
    }

    if (watermark.trim() !== '') {
      options.watermark = { text: watermark.trim() };
    }

    return options;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (file === null) {
      setError('Pick an image first');
      return;
    }

    setError(null);
    setBusy(true);

    try {
      const image = await uploadImage(file);
      clearPickedFile();

      const queued = await transformImage(image.id, buildOptions());
      setJob(queued);
      onJobQueued(queued.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>Upload and transform</h2>

      <form onSubmit={handleSubmit}>
        <label>
          Image
          <input type="file" accept="image/*" ref={fileInput} onChange={handleFile} />
        </label>

        {preview !== null && (
          <img className="preview" src={preview} alt="Selected upload preview" />
        )}

        <fieldset>
          <legend>Transform</legend>

          <label>
            Width
            <input
              type="number"
              min="1"
              max="4096"
              value={width}
              onChange={(event) => setWidth(event.target.value)}
            />
          </label>

          <label>
            Format
            <select value={format} onChange={(event) => setFormat(event.target.value)}>
              {FORMATS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="inline">
            <input
              type="checkbox"
              checked={grayscale}
              onChange={(event) => setGrayscale(event.target.checked)}
            />
            Grayscale
          </label>

          <label className="inline">
            <input
              type="checkbox"
              checked={sepia}
              onChange={(event) => setSepia(event.target.checked)}
            />
            Sepia
          </label>

          <label>
            Watermark
            <input
              type="text"
              maxLength={64}
              value={watermark}
              onChange={(event) => setWatermark(event.target.value)}
            />
          </label>
        </fieldset>

        <button type="submit" disabled={busy}>
          {busy ? 'Uploading...' : 'Upload and queue transform'}
        </button>
      </form>

      {error !== null && <p className="error">{error}</p>}

      {job !== null && (
        <p className="status">
          Queued job <code>{job.id}</code> - status <strong>{job.status}</strong>
        </p>
      )}
    </section>
  );
}
