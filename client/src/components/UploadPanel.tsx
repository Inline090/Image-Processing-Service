import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { transformImage, uploadImage, type Job, type TransformOptions } from '../api';

const FORMATS = ['webp', 'jpeg', 'png'] as const;

type Format = (typeof FORMATS)[number];

type Props = {
  onJobQueued: (jobId: string) => void;
};

function parseNumber(value: string, min: number, max: number): number | undefined {
  if (value.trim() === '') {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

export function UploadPanel({ onJobQueued }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [width, setWidth] = useState('400');
  const [format, setFormat] = useState<Format>('webp');
  const [quality, setQuality] = useState('82');
  const [grayscale, setGrayscale] = useState(false);
  const [sepia, setSepia] = useState(false);
  const [watermark, setWatermark] = useState('');
  const [brightness, setBrightness] = useState('');
  const [saturation, setSaturation] = useState('');
  const [hue, setHue] = useState('');
  const [lightness, setLightness] = useState('');
  const [blur, setBlur] = useState('');
  const [sharpen, setSharpen] = useState(false);
  const [sharpenSigma, setSharpenSigma] = useState('1.5');
  const [flip, setFlip] = useState(false);
  const [flop, setFlop] = useState(false);
  const [trim, setTrim] = useState(false);
  const [pad, setPad] = useState('');
  const [useBackground, setUseBackground] = useState(false);
  const [background, setBackground] = useState('#ffffff');
  const [flatten, setFlatten] = useState(false);
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

  function buildOptions(): TransformOptions {
    const options: TransformOptions = { format };

    const parsedWidth = parseNumber(width, 1, 4096);
    if (parsedWidth !== undefined) {
      options.width = Math.round(parsedWidth);
    }

    const parsedQuality = parseNumber(quality, 1, 100);
    if (parsedQuality !== undefined) {
      options.quality = Math.round(parsedQuality);
    }

    const modulate: NonNullable<TransformOptions['modulate']> = {};
    const parsedBrightness = parseNumber(brightness, 0, 10);
    const parsedSaturation = parseNumber(saturation, 0, 10);
    const parsedHue = parseNumber(hue, 0, 360);
    const parsedLightness = parseNumber(lightness, 0, 100);

    if (parsedBrightness !== undefined) {
      modulate.brightness = parsedBrightness;
    }

    if (parsedSaturation !== undefined) {
      modulate.saturation = parsedSaturation;
    }

    if (parsedHue !== undefined) {
      modulate.hue = parsedHue;
    }

    if (parsedLightness !== undefined) {
      modulate.lightness = parsedLightness;
    }

    if (Object.keys(modulate).length > 0) {
      options.modulate = modulate;
    }

    const parsedBlur = parseNumber(blur, 0.3, 1000);
    if (parsedBlur !== undefined) {
      options.blur = parsedBlur;
    }

    if (sharpen) {
      const parsedSigma = parseNumber(sharpenSigma, 0.000001, 10000);
      options.sharpen = parsedSigma === undefined ? true : { sigma: parsedSigma };
    }

    if (flip) {
      options.flip = true;
    }

    if (flop) {
      options.flop = true;
    }

    if (trim) {
      options.trim = true;
    }

    if (useBackground) {
      options.background = background;
    }

    const parsedPad = parseNumber(pad, 1, 4096);
    if (parsedPad !== undefined) {
      const side = Math.round(parsedPad);

      options.extend = { top: side, bottom: side, left: side, right: side };
    }

    if (flatten) {
      options.flatten = true;
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

          <div className="pairs">
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
              Quality
              <input
                type="number"
                min="1"
                max="100"
                value={quality}
                onChange={(event) => setQuality(event.target.value)}
              />
            </label>

            <label>
              Format
              <select value={format} onChange={(event) => setFormat(event.target.value as Format)}>
                {FORMATS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

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

        <fieldset>
          <legend>Adjustments</legend>

          <div className="pairs">
            <label>
              Brightness
              <input
                type="number"
                min="0"
                max="10"
                step="0.1"
                placeholder="1"
                value={brightness}
                onChange={(event) => setBrightness(event.target.value)}
              />
            </label>

            <label>
              Saturation
              <input
                type="number"
                min="0"
                max="10"
                step="0.1"
                placeholder="1"
                value={saturation}
                onChange={(event) => setSaturation(event.target.value)}
              />
            </label>

            <label>
              Hue
              <input
                type="number"
                min="0"
                max="360"
                placeholder="0"
                value={hue}
                onChange={(event) => setHue(event.target.value)}
              />
            </label>

            <label>
              Lightness
              <input
                type="number"
                min="0"
                max="100"
                placeholder="0"
                value={lightness}
                onChange={(event) => setLightness(event.target.value)}
              />
            </label>

            <label>
              Blur
              <input
                type="number"
                min="0.3"
                max="1000"
                step="0.1"
                placeholder="off"
                value={blur}
                onChange={(event) => setBlur(event.target.value)}
              />
            </label>

            <label>
              Sharpen sigma
              <input
                type="number"
                min="0.000001"
                max="10000"
                step="0.1"
                value={sharpenSigma}
                disabled={!sharpen}
                onChange={(event) => setSharpenSigma(event.target.value)}
              />
            </label>
          </div>

          <label className="inline">
            <input
              type="checkbox"
              checked={sharpen}
              onChange={(event) => setSharpen(event.target.checked)}
            />
            Sharpen
          </label>
        </fieldset>

        <fieldset>
          <legend>Geometry and canvas</legend>

          <label className="inline">
            <input
              type="checkbox"
              checked={flip}
              onChange={(event) => setFlip(event.target.checked)}
            />
            Flip vertically
          </label>

          <label className="inline">
            <input
              type="checkbox"
              checked={flop}
              onChange={(event) => setFlop(event.target.checked)}
            />
            Flop horizontally
          </label>

          <label className="inline">
            <input
              type="checkbox"
              checked={trim}
              onChange={(event) => setTrim(event.target.checked)}
            />
            Trim uniform borders
          </label>

          <label className="inline">
            <input
              type="checkbox"
              checked={flatten}
              onChange={(event) => setFlatten(event.target.checked)}
            />
            Flatten transparency
          </label>

          <div className="pairs">
            <label>
              Pad (px)
              <input
                type="number"
                min="1"
                max="4096"
                placeholder="off"
                value={pad}
                onChange={(event) => setPad(event.target.value)}
              />
            </label>

            <label>
              Background
              <input
                type="color"
                value={background}
                disabled={!useBackground}
                onChange={(event) => setBackground(event.target.value)}
              />
            </label>
          </div>

          <label className="inline">
            <input
              type="checkbox"
              checked={useBackground}
              onChange={(event) => setUseBackground(event.target.checked)}
            />
            Use the background for padding, letterboxing and flattening
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
