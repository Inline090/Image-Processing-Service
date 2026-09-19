import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  transformImage,
  uploadImage,
  type CropFocus,
  type Job,
  type TransformOptions,
} from '../api';
import { Button } from './ui/Button';
import { Field } from './ui/Field';
import { Panel } from './ui/Panel';
import { Slider } from './ui/Slider';

const FORMATS = ['webp', 'avif', 'jpeg', 'png'] as const;

type Format = (typeof FORMATS)[number];

// Effort is the encoder's own knob. WebP stops at 6 and AVIF at 9, so 6 is the
// ceiling both accept, and past it the encoder spends several times the time for
// a couple of percent - the shared range is the useful part of both.
const MAX_EFFORT = 6;
const DEFAULT_EFFORT = 4;

function usesEffort(format: Format): boolean {
  return format === 'webp' || format === 'avif';
}

// What each focus strategy keeps. A native select renders its own dropdown, so a
// title on an option is only shown by some browsers - the description of the
// current choice has to be visible under the control to be reliable.
const FOCUS_DESCRIPTIONS: Record<CropFocus, string> = {
  center: 'Keeps the middle of the image.',
  attention: 'Keeps the area that stands out most, such as a face or a bright subject.',
  entropy: 'Keeps the area holding the most detail.',
};

type Props = {
  onJobQueued: (jobId: string) => void;
  /**
   * Fired once an upload has been accepted. A guest's allowance is spent by the
   * upload itself, so the count is re-read from here rather than after the
   * transform, which can still fail.
   */
  onUploaded: () => void;
};

function parseNumber(value: string, min: number, max: number): number | undefined {
  if (value.trim() === '') {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;

  return Math.round(value * factor) / factor;
}

// Every option's starting value, in one place: the state below starts from these
// and Reset puts them all back, so the two cannot drift apart.
const DEFAULTS = {
  crop: false,
  width: '400',
  height: '',
  focus: 'center' as CropFocus,
  format: 'webp' as Format,
  quality: 100,
  effort: DEFAULT_EFFORT,
  grayscale: false,
  sepia: false,
  watermark: '',
  brightness: 1,
  saturation: 1,
  hue: 0,
  lightness: 0,
  blur: 0,
  sharpen: false,
  sharpenSigma: 1.5,
  flip: false,
  flop: false,
  trim: false,
  pad: '',
  useBackground: false,
  background: '#ffffff',
  flatten: false,
};

// Every option carries a tooltip saying what it does. The ones that take a
// bounded value are sliders, whose end captions state the range; the ones that
// take a plain measurement stay number fields, whose hint states it.
export function UploadPanel({ onJobQueued, onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [crop, setCrop] = useState(DEFAULTS.crop);
  const [width, setWidth] = useState(DEFAULTS.width);
  const [height, setHeight] = useState(DEFAULTS.height);
  const [focus, setFocus] = useState<CropFocus>(DEFAULTS.focus);
  const [format, setFormat] = useState<Format>(DEFAULTS.format);
  const [quality, setQuality] = useState(DEFAULTS.quality);
  const [effort, setEffort] = useState(DEFAULTS.effort);
  const [grayscale, setGrayscale] = useState(DEFAULTS.grayscale);
  const [sepia, setSepia] = useState(DEFAULTS.sepia);
  const [watermark, setWatermark] = useState(DEFAULTS.watermark);
  const [brightness, setBrightness] = useState(DEFAULTS.brightness);
  const [saturation, setSaturation] = useState(DEFAULTS.saturation);
  const [hue, setHue] = useState(DEFAULTS.hue);
  const [lightness, setLightness] = useState(DEFAULTS.lightness);
  const [blur, setBlur] = useState(DEFAULTS.blur);
  const [sharpen, setSharpen] = useState(DEFAULTS.sharpen);
  const [sharpenSigma, setSharpenSigma] = useState(DEFAULTS.sharpenSigma);
  const [flip, setFlip] = useState(DEFAULTS.flip);
  const [flop, setFlop] = useState(DEFAULTS.flop);
  const [trim, setTrim] = useState(DEFAULTS.trim);
  const [pad, setPad] = useState(DEFAULTS.pad);
  const [useBackground, setUseBackground] = useState(DEFAULTS.useBackground);
  const [background, setBackground] = useState(DEFAULTS.background);
  const [flatten, setFlatten] = useState(DEFAULTS.flatten);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [notKept, setNotKept] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);

  // Puts every option back to its starting value. The picked image, the job and
  // the notice about the history are not settings, so they are left alone.
  function resetSettings(): void {
    setCrop(DEFAULTS.crop);
    setWidth(DEFAULTS.width);
    setHeight(DEFAULTS.height);
    setFocus(DEFAULTS.focus);
    setFormat(DEFAULTS.format);
    setQuality(DEFAULTS.quality);
    setEffort(DEFAULTS.effort);
    setGrayscale(DEFAULTS.grayscale);
    setSepia(DEFAULTS.sepia);
    setWatermark(DEFAULTS.watermark);
    setBrightness(DEFAULTS.brightness);
    setSaturation(DEFAULTS.saturation);
    setHue(DEFAULTS.hue);
    setLightness(DEFAULTS.lightness);
    setBlur(DEFAULTS.blur);
    setSharpen(DEFAULTS.sharpen);
    setSharpenSigma(DEFAULTS.sharpenSigma);
    setFlip(DEFAULTS.flip);
    setFlop(DEFAULTS.flop);
    setTrim(DEFAULTS.trim);
    setPad(DEFAULTS.pad);
    setUseBackground(DEFAULTS.useBackground);
    setBackground(DEFAULTS.background);
    setFlatten(DEFAULTS.flatten);

    // A message about the last attempt no longer describes the form on screen.
    setError(null);
  }

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
    setNotKept(false);

    if (picked !== null) {
      setPreview(URL.createObjectURL(picked));
    }
  }

  function buildOptions(): TransformOptions {
    const options: TransformOptions = { format, quality: Math.round(quality) };

    // Only the two lossy modern encoders take an effort setting.
    if (usesEffort(format)) {
      options.effort = effort;
    }

    if (crop) {
      const parsedWidth = parseNumber(width, 1, 4096);
      if (parsedWidth !== undefined) {
        options.width = Math.round(parsedWidth);
      }

      const parsedHeight = parseNumber(height, 1, 4096);
      if (parsedHeight !== undefined) {
        options.height = Math.round(parsedHeight);
      }

      // The centre is what the resize does anyway, so only the region-picking
      // strategies are worth sending.
      if (focus !== 'center') {
        options.focus = focus;
      }
    }

    // A slider always carries a value, so "unchanged" is expressed by leaving the
    // option out. At its neutral value an adjustment is a no-op for the image,
    // and sending it would only fragment the cache key.
    const modulate: NonNullable<TransformOptions['modulate']> = {};

    if (brightness !== 1) {
      modulate.brightness = round(brightness, 1);
    }

    if (saturation !== 1) {
      modulate.saturation = round(saturation, 1);
    }

    if (hue !== 0) {
      modulate.hue = Math.round(hue);
    }

    if (lightness !== 0) {
      modulate.lightness = Math.round(lightness);
    }

    if (Object.keys(modulate).length > 0) {
      options.modulate = modulate;
    }

    // Zero is the off position; the API's minimum radius is 0.3.
    if (blur > 0) {
      options.blur = round(blur, 1);
    }

    if (sharpen) {
      options.sharpen = { sigma: round(sharpenSigma, 2) };
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
      setNotKept(image.ephemeral);
      onUploaded();

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
    <Panel
      title="Transform"
      actions={
        <Button
          variant="link"
          title="Put every option back to how it starts."
          onClick={resetSettings}
        >
          Reset
        </Button>
      }
    >
      <form onSubmit={handleSubmit}>
        <div className="group">
          {/* Not the Field primitive: that renders a <label>, and the file input
              needs a label of its own, so nesting them would be invalid. */}
          <div
            className="field"
            title="The image to transform. PNG, JPEG, WebP or GIF, up to 10 MB."
          >
            <span className="field-label label">Image</span>

            <label className="file-field">
              <span className="file-chip" aria-hidden="true">
                Choose image
              </span>
              <span className="file-name">{file === null ? 'No image selected' : file.name}</span>
              <input
                className="file-input"
                type="file"
                accept="image/*"
                aria-label="Image"
                ref={fileInput}
                onChange={handleFile}
              />
            </label>

            <span className="field-hint">PNG, JPEG, WebP or GIF &middot; max 10 MB</span>
          </div>

          {preview !== null && (
            <img className="preview preview--thumb" src={preview} alt="Selected upload preview" />
          )}
        </div>

        <fieldset>
          <legend>Transform</legend>

          <div className="group">
            <label className="inline" title="Resize the image to the width and height below.">
              <input
                type="checkbox"
                checked={crop}
                onChange={(event) => setCrop(event.target.checked)}
              />
              Crop
            </label>

            <div className="pairs">
              {crop && (
                <>
                  <Field
                    label="Width"
                    tooltip="Target width in pixels. Left blank, the width is left alone."
                    hint="1-4096 px"
                  >
                    <input
                      type="number"
                      min="1"
                      max="4096"
                      value={width}
                      onChange={(event) => setWidth(event.target.value)}
                    />
                  </Field>

                  <Field
                    label="Height"
                    tooltip="Target height in pixels. Leave blank to keep the original aspect ratio."
                    hint="1-4096 px &middot; blank keeps the ratio"
                  >
                    <input
                      type="number"
                      min="1"
                      max="4096"
                      placeholder="auto"
                      value={height}
                      onChange={(event) => setHeight(event.target.value)}
                    />
                  </Field>

                  <Field
                    label="Focus"
                    tooltip="What the crop keeps: the middle, the busiest area, or the most detailed area."
                    hint={FOCUS_DESCRIPTIONS[focus]}
                  >
                    <select
                      value={focus}
                      onChange={(event) => setFocus(event.target.value as CropFocus)}
                    >
                      <option value="center" title={FOCUS_DESCRIPTIONS.center}>
                        center
                      </option>
                      <option value="attention" title={FOCUS_DESCRIPTIONS.attention}>
                        attention
                      </option>
                      <option value="entropy" title={FOCUS_DESCRIPTIONS.entropy}>
                        entropy
                      </option>
                    </select>
                  </Field>
                </>
              )}

              <Field
                label="Format"
                tooltip="Output file type. AVIF and WebP are the smallest, PNG is lossless, JPEG is the most compatible."
                hint="webp, avif, jpeg or png"
              >
                <select
                  value={format}
                  onChange={(event) => setFormat(event.target.value as Format)}
                >
                  {FORMATS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Slider
              label="Quality"
              tooltip="Encoder quality for JPEG, WebP and AVIF. PNG is lossless and ignores it."
              min={1}
              max={100}
              step={1}
              value={quality}
              onChange={setQuality}
              format={(value) => String(Math.round(value))}
            />

            {usesEffort(format) && (
              <Slider
                label="Effort"
                tooltip="How hard the encoder works for a smaller file. Higher is slower for slightly less size."
                min={0}
                max={MAX_EFFORT}
                step={1}
                value={effort}
                onChange={setEffort}
                format={(value) => String(Math.round(value))}
              />
            )}

            <label
              className="inline"
              title="Drop all colour and keep the brightness as shades of grey."
            >
              <input
                type="checkbox"
                checked={grayscale}
                onChange={(event) => setGrayscale(event.target.checked)}
              />
              Grayscale
            </label>

            <label className="inline" title="Give the image a warm brown, aged tone.">
              <input
                type="checkbox"
                checked={sepia}
                onChange={(event) => setSepia(event.target.checked)}
              />
              Sepia
            </label>

            <Field
              label="Watermark"
              tooltip="Text stamped onto the result, drawn over the bottom right corner."
              hint="1-64 characters &middot; blank adds none"
            >
              <input
                type="text"
                maxLength={64}
                value={watermark}
                onChange={(event) => setWatermark(event.target.value)}
              />
            </Field>
          </div>
        </fieldset>

        <fieldset>
          <legend>Adjustments</legend>

          <div className="group">
            <Slider
              label="Brightness"
              tooltip="Lighten or darken the image. 1 leaves it unchanged."
              min={0}
              max={10}
              step={0.1}
              value={brightness}
              onChange={setBrightness}
              format={(value) => value.toFixed(1)}
            />

            <Slider
              label="Saturation"
              tooltip="Colour intensity. 0 is fully grey, 1 leaves it unchanged."
              min={0}
              max={10}
              step={0.1}
              value={saturation}
              onChange={setSaturation}
              format={(value) => value.toFixed(1)}
            />

            <Slider
              label="Hue"
              tooltip="Rotate every colour around the colour wheel."
              min={0}
              max={360}
              step={1}
              value={hue}
              onChange={setHue}
              format={(value) => `${Math.round(value)}°`}
            />

            <Slider
              label="Lightness"
              tooltip="Blend the image towards white without shifting its colours."
              min={0}
              max={100}
              step={1}
              value={lightness}
              onChange={setLightness}
              format={(value) => String(Math.round(value))}
            />

            <Slider
              label="Blur"
              tooltip="Soften the image with a Gaussian blur of this radius."
              min={0}
              max={20}
              step={0.1}
              value={blur}
              onChange={(value) => setBlur(value === 0 ? 0 : Math.max(0.3, value))}
              format={(value) => (value === 0 ? 'Off' : `${value.toFixed(1)} px`)}
            />

            <label
              className="inline"
              title="Increase contrast along edges so the image looks crisper."
            >
              <input
                type="checkbox"
                checked={sharpen}
                onChange={(event) => setSharpen(event.target.checked)}
              />
              Sharpen
            </label>

            <Slider
              label="Sharpen sigma"
              tooltip="Radius of the sharpening pass. Smaller values sharpen only the fine detail."
              min={0.1}
              max={10}
              step={0.1}
              value={sharpenSigma}
              disabled={!sharpen}
              onChange={setSharpenSigma}
              format={(value) => value.toFixed(2)}
            />
          </div>
        </fieldset>

        <fieldset>
          <legend>Geometry and canvas</legend>

          <div className="group">
            <label className="inline" title="Mirror the image top to bottom.">
              <input
                type="checkbox"
                checked={flip}
                onChange={(event) => setFlip(event.target.checked)}
              />
              Flip vertically
            </label>

            <label className="inline" title="Mirror the image left to right.">
              <input
                type="checkbox"
                checked={flop}
                onChange={(event) => setFlop(event.target.checked)}
              />
              Flop horizontally
            </label>

            <label
              className="inline"
              title="Cut away a single-colour border, such as a flat scan edge."
            >
              <input
                type="checkbox"
                checked={trim}
                onChange={(event) => setTrim(event.target.checked)}
              />
              Trim uniform borders
            </label>

            <label
              className="inline"
              title="Lay transparency onto the background colour instead of keeping it."
            >
              <input
                type="checkbox"
                checked={flatten}
                onChange={(event) => setFlatten(event.target.checked)}
              />
              Flatten transparency
            </label>

            <div className="pairs">
              <Field
                label="Pad (px)"
                tooltip="Add a border of this many pixels on every side of the image."
                hint="1-4096 px &middot; blank = off"
              >
                <input
                  type="number"
                  min="1"
                  max="4096"
                  placeholder="off"
                  value={pad}
                  onChange={(event) => setPad(event.target.value)}
                />
              </Field>

              <Field
                label="Background"
                tooltip="The colour used for padding, letterboxing and flattening."
                hint="Any hex colour"
              >
                <span className="color-field">
                  <input
                    className="color-input"
                    type="color"
                    value={background}
                    disabled={!useBackground}
                    onChange={(event) => setBackground(event.target.value)}
                  />
                  <span className="color-wheel" aria-hidden="true" />
                </span>
              </Field>
            </div>

            <label
              className="inline"
              title="Apply the chosen colour instead of transparent black, wherever the canvas grows."
            >
              <input
                type="checkbox"
                checked={useBackground}
                onChange={(event) => setUseBackground(event.target.checked)}
              />
              Use the background for padding, letterboxing and flattening
            </label>
          </div>
        </fieldset>

        <div className="group">
          <Button
            type="submit"
            variant="primary"
            disabled={busy}
            title="Upload the image and queue the transform for the worker."
          >
            {busy ? 'Uploading...' : 'Upload'}
          </Button>

          {error !== null && <p className="notice">{error}</p>}

          {notKept && (
            <p className="notice notice--info">
              Your history is full, so this result is not kept. Download it from the job below, or
              delete an image from your history to make room.
            </p>
          )}

          {job !== null && (
            <p className="status">
              Queued job <code className="code">{job.id}</code> - status{' '}
              <strong>{job.status}</strong>
            </p>
          )}
        </div>
      </form>
    </Panel>
  );
}
