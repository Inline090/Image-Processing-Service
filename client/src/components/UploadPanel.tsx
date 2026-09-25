import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from 'react';
import { X } from 'lucide-react';
import {
  MAX_BATCH_IMAGES,
  transformBulk,
  transformImage,
  uploadImages,
  type CropFocus,
  type TransformOptions,
} from '../api';
import type { TransformRun } from '../run';
import { LivePreview } from './LivePreview';
import { Button } from './ui/Button';
import { Field } from './ui/Field';
import { Panel } from './ui/Panel';
import { Slider } from './ui/Slider';

const FORMATS = ['webp', 'avif', 'jpeg', 'png'] as const;

type Format = (typeof FORMATS)[number];

type SizeMode = 'percent' | 'pixels';

const MAX_EFFORT = 6;
const DEFAULT_EFFORT = 4;

const MAX_OUTPUT_EDGE = 4096;

const DEFAULT_TRIM_THRESHOLD = 10;
const MAX_TRIM_THRESHOLD = 100;

function usesEffort(format: Format): boolean {
  return format === 'webp' || format === 'avif';
}

const FOCUS_DESCRIPTIONS: Record<CropFocus, string> = {
  center: 'Keeps the middle of the image.',
  attention: 'Keeps the area that stands out most, such as a face or a bright subject.',
  entropy: 'Keeps the area holding the most detail.',
};

function focusHintFor(mode: SizeMode, hasCrop: boolean, focus: CropFocus): string {
  if (mode === 'percent') {
    return 'A percentage crops from the middle, so this does not apply.';
  }

  if (!hasCrop) {
    return 'Nothing is cropped at this size, so this has no effect yet.';
  }

  return FOCUS_DESCRIPTIONS[focus];
}

type Props = {
  onJobQueued: (jobId: string) => void;

  onRunQueued: (run: TransformRun) => void;


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

function clampPercent(value: number): number {
  return Math.min(100, Math.max(10, Math.round(value)));
}

function originalSize(size: { width: number; height: number } | null): {
  width: string;
  height: string;
} {
  if (size === null) {
    return { width: '', height: '' };
  }

  return {
    width: String(Math.min(size.width, MAX_OUTPUT_EDGE)),
    height: String(Math.min(size.height, MAX_OUTPUT_EDGE)),
  };
}

type PreviewItem = {
  url: string;
  name: string;
};

function fileNameLabel(picked: File[]): string {
  if (picked.length === 0) {
    return 'No image selected';
  }

  return picked.length === 1 ? picked[0].name : `${picked.length} images selected`;
}

const DEFAULTS = {
  crop: false,
  sizeMode: 'pixels' as SizeMode,
  keepWidth: 100,
  keepHeight: 100,
  width: '',
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
  trimThreshold: DEFAULT_TRIM_THRESHOLD,
  pad: '',
  useBackground: false,
  background: '#ffffff',
  flatten: false,
};

export function UploadPanel({
  onJobQueued,
  onRunQueued,

  onUploaded,
}: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [previews, setPreviews] = useState<PreviewItem[]>([]);
  const [crop, setCrop] = useState(DEFAULTS.crop);
  const [sizeMode, setSizeMode] = useState<SizeMode>(DEFAULTS.sizeMode);
  const [keepWidth, setKeepWidth] = useState(DEFAULTS.keepWidth);
  const [keepHeight, setKeepHeight] = useState(DEFAULTS.keepHeight);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
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
  const [trimThreshold, setTrimThreshold] = useState(DEFAULTS.trimThreshold);
  const [pad, setPad] = useState(DEFAULTS.pad);
  const [useBackground, setUseBackground] = useState(DEFAULTS.useBackground);
  const [background, setBackground] = useState(DEFAULTS.background);
  const [flatten, setFlatten] = useState(DEFAULTS.flatten);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [emailNotice, setEmailNotice] = useState(false);

  const liveMode: SizeMode = imageSize === null ? 'pixels' : sizeMode;

  const paintsBackground = flatten || Number(pad) > 0;

  const focusSize = {
    width: parseNumber(width, 1, MAX_OUTPUT_EDGE),
    height: parseNumber(height, 1, MAX_OUTPUT_EDGE),
  };

  const focusHasACrop =
    imageSize !== null &&
    focusSize.width !== undefined &&
    focusSize.height !== undefined &&
    Math.abs(focusSize.width / focusSize.height - imageSize.width / imageSize.height) > 0.01;

  const focusHint = focusHintFor(liveMode, focusHasACrop, focus);

  const fileInput = useRef<HTMLInputElement>(null);
  const addInput = useRef<HTMLInputElement>(null);

  function resetSettings(): void {
    const fields = originalSize(imageSize);

    setCrop(DEFAULTS.crop);
    setSizeMode(DEFAULTS.sizeMode);
    setKeepWidth(DEFAULTS.keepWidth);
    setKeepHeight(DEFAULTS.keepHeight);
    setWidth(fields.width);
    setHeight(fields.height);
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
    setTrimThreshold(DEFAULTS.trimThreshold);
    setPad(DEFAULTS.pad);
    setUseBackground(DEFAULTS.useBackground);
    setBackground(DEFAULTS.background);
    setFlatten(DEFAULTS.flatten);

    setError(null);
  }

  function releasePreviews(): void {
    for (const item of previews) {
      URL.revokeObjectURL(item.url);
    }

    setPreviews([]);
  }

  function clearPickedFile(): void {
    setFiles([]);
    setImageSize(null);
    releasePreviews();

    if (fileInput.current !== null) {
      fileInput.current.value = '';
    }
  }

  // createImageBitmap applies EXIF rotation, the same way sharp reads the file.
  async function measure(picked: File): Promise<{ width: number; height: number } | null> {
    try {
      const bitmap = await createImageBitmap(picked);
      const size = { width: bitmap.width, height: bitmap.height };

      bitmap.close();

      return size;
    } catch {
      return null;
    }
  }

  async function measureImage(picked: File): Promise<void> {
    const size = await measure(picked);
    const fields = originalSize(size);

    setImageSize(size);
    setWidth(fields.width);
    setHeight(fields.height);
    setKeepWidth(DEFAULTS.keepWidth);
    setKeepHeight(DEFAULTS.keepHeight);
  }

  function changeKeepWidth(next: number): void {
    setKeepWidth(next);

    if (imageSize !== null) {
      setWidth(String(Math.max(1, Math.round((imageSize.width * next) / 100))));
    }
  }

  function changeKeepHeight(next: number): void {
    setKeepHeight(next);

    if (imageSize !== null) {
      setHeight(String(Math.max(1, Math.round((imageSize.height * next) / 100))));
    }
  }

  function changeWidth(next: string): void {
    setWidth(next);

    const parsed = parseNumber(next, 1, 20000);

    if (parsed !== undefined && imageSize !== null) {
      setKeepWidth(clampPercent((parsed / imageSize.width) * 100));
    }
  }

  function changeHeight(next: string): void {
    setHeight(next);

    const parsed = parseNumber(next, 1, 20000);

    if (parsed !== undefined && imageSize !== null) {
      setKeepHeight(clampPercent((parsed / imageSize.height) * 100));
    }
  }

  function changeSizeMode(next: SizeMode): void {
    if (next === sizeMode) {
      return;
    }

    if (imageSize !== null) {
      if (next === 'percent') {
        const parsedWidth = parseNumber(width, 1, 20000);
        const parsedHeight = parseNumber(height, 1, 20000);

        if (parsedWidth !== undefined) {
          setKeepWidth(clampPercent((parsedWidth / imageSize.width) * 100));
        }

        if (parsedHeight !== undefined) {
          setKeepHeight(clampPercent((parsedHeight / imageSize.height) * 100));
        }
      } else {
        setWidth(String(Math.max(1, Math.round((imageSize.width * keepWidth) / 100))));
        setHeight(String(Math.max(1, Math.round((imageSize.height * keepHeight) / 100))));
      }
    }

    setSizeMode(next);
  }

  function acceptFiles(picked: File[]): void {
    const batch = picked.slice(0, MAX_BATCH_IMAGES);
    const first = batch[0];

    if (first === undefined) {
      return;
    }

    if (batch.length < picked.length) {
      setError(`At most ${MAX_BATCH_IMAGES} images at a time. The rest were left out.`);
    }

    releasePreviews();
    setFiles(batch);
    setImageSize(null);
    setSummary(null);
    setEmailNotice(false);
    setProgress(null);

    setPreviews(batch.map((file) => ({ url: URL.createObjectURL(file), name: file.name })));
    void measureImage(first);
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>): void {
    acceptFiles(Array.from(event.target.files ?? []));
  }

  function appendFiles(picked: File[]): void {
    const combined = [...files, ...picked];
    const batch = combined.slice(0, MAX_BATCH_IMAGES);
    const added = batch.slice(files.length);

    if (added.length === 0) {
      return;
    }

    if (batch.length < combined.length) {
      setError(`At most ${MAX_BATCH_IMAGES} images at a time. The rest were left out.`);
    }

    setFiles(batch);
    setSummary(null);
    setEmailNotice(false);
    setProgress(null);
    setPreviews((current) => [
      ...current,
      ...added.map((file) => ({ url: URL.createObjectURL(file), name: file.name })),
    ]);
  }

  function handleAdd(event: ChangeEvent<HTMLInputElement>): void {
    appendFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  }

  function removeFile(index: number): void {
    const removed = previews[index];

    if (removed !== undefined) {
      URL.revokeObjectURL(removed.url);
    }

    const remaining = files.filter((_, position) => position !== index);

    setFiles(remaining);
    setPreviews(previews.filter((_, position) => position !== index));
    setSummary(null);
    setEmailNotice(false);
    setProgress(null);

    if (index === 0) {
      setImageSize(null);

      const next = remaining[0];

      if (next === undefined) {
        setWidth(DEFAULTS.width);
        setHeight(DEFAULTS.height);
      } else {
        void measureImage(next);
      }
    }
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>): void {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }

    setDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault();
    setDragging(false);
    acceptFiles(Array.from(event.dataTransfer.files));
  }

  useEffect(() => {
    function block(event: Event): void {
      event.preventDefault();
      setDragging(false);
    }

    window.addEventListener('dragover', block);
    window.addEventListener('drop', block);

    return () => {
      window.removeEventListener('dragover', block);
      window.removeEventListener('drop', block);
    };
  }, []);

  // Only changed options are sent, so the cache key stays stable.
  function buildOptions(size: { width: number; height: number } | null): TransformOptions {
    const options: TransformOptions = { format, quality: Math.round(quality) };

    if (usesEffort(format)) {
      options.effort = effort;
    }

    if (crop) {
      if (sizeMode === 'percent' && size !== null) {
        if (keepWidth < 100 || keepHeight < 100) {
          const cropWidth = Math.max(1, Math.round((size.width * keepWidth) / 100));
          const cropHeight = Math.max(1, Math.round((size.height * keepHeight) / 100));

          options.crop = {
            left: Math.round((size.width - cropWidth) / 2),
            top: Math.round((size.height - cropHeight) / 2),
            width: cropWidth,
            height: cropHeight,
          };
        }
      } else {
        const parsedWidth = parseNumber(width, 1, 4096);
        if (parsedWidth !== undefined) {
          options.width = Math.round(parsedWidth);
        }

        const parsedHeight = parseNumber(height, 1, 4096);
        if (parsedHeight !== undefined) {
          options.height = Math.round(parsedHeight);
        }

        options.focus = focus;
      }
    }

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
      options.trim =
        trimThreshold === DEFAULT_TRIM_THRESHOLD ? true : { threshold: Math.round(trimThreshold) };
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

  // One upload for the whole batch, then one transform per path taken.
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (files.length === 0) {
      setError('Pick an image first');
      return;
    }

    setError(null);
    setSummary(null);
    setEmailNotice(false);
    setBusy(true);

    try {
      setProgress(`Uploading ${files.length} ${files.length === 1 ? 'image' : 'images'}`);

      const { images } = await uploadImages(files);

      const accepted = images.flatMap((image, index) => {
        const picked = files[index];

        if (picked === undefined) {
          return [];
        }

        return [{ file: picked, id: image.id }];
      });

      clearPickedFile();
      onUploaded();
      setProgress(null);

      const single = accepted[0];

      if (accepted.length === 1 && single !== undefined) {
        const queued = await transformImage(single.id, buildOptions(imageSize));

        onJobQueued(queued.id);
      } else if (crop && liveMode === 'percent') {
        const jobIds: string[] = [];

        for (const item of accepted) {
          setProgress(`Queued ${jobIds.length + 1} of ${accepted.length}`);

          const job = await transformImage(item.id, buildOptions(await measure(item.file)));
          jobIds.push(job.id);
        }

        if (jobIds.length > 0) {
          onRunQueued({ kind: 'jobs', jobIds });
        }
      } else {
        const result = await transformBulk(
          accepted.map((each) => each.id),
          buildOptions(null),
        );

        if (result.queued > 0) {
          onRunQueued({ kind: 'batch', batchId: result.batchId });
        }

        setSummary(
          `Queued ${result.queued} of ${accepted.length}` +
            (result.alreadyDone > 0 ? `, ${result.alreadyDone} already done` : ''),
        );

        setEmailNotice(result.queued > 0);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setProgress(null);
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

          <div
            className="field"
            title="The images to transform. PNG, JPEG, WebP or GIF, up to 10 MB each."
          >
            <span className="field-label label">Images</span>

            <label
              className={dragging ? 'file-field file-field--over' : 'file-field'}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <span className="file-chip">
                {dragging ? 'Drop to add' : 'Choose images'}
              </span>
              <span className="file-name">{fileNameLabel(files)}</span>
              <input
                className="file-input"
                type="file"
                accept="image/*"
                multiple
                ref={fileInput}
                onChange={handleFile}
              />
            </label>

            <span className="field-hint">PNG, JPEG, WebP or GIF, up to 10 MB</span>
          </div>

          {previews.length === 1 && previews[0] !== undefined && (
            <LivePreview
              src={previews[0].url}
              options={buildOptions(imageSize)}
              size={imageSize}
            />
          )}

          {previews.length > 0 && (
            <ul className="picked-grid">
              {previews.map((item, index) => (
                <li key={item.url}>
                  <img className="picked-thumb" src={item.url} />

                  <button
                    type="button"
                    className="picked-remove icon-btn icon-btn--danger"
                    title="Remove this image from the batch."
                    onClick={() => removeFile(index)}
                  >
                    <X size={14} strokeWidth={1.5} />
                  </button>

                  <span className="picked-name">{item.name}</span>
                </li>
              ))}

              {files.length < MAX_BATCH_IMAGES && (
                <li>
                  <button
                    type="button"
                    className="picked-add"
                    onClick={() => addInput.current?.click()}
                  >
                    +
                  </button>
                  <input
                    className="file-input"
                    type="file"
                    accept="image/*"
                    multiple
                    tabIndex={-1}
                    ref={addInput}
                    onChange={handleAdd}
                  />
                  <span className="picked-name">Add more</span>
                </li>
              )}
            </ul>
          )}
        </div>

        <fieldset>
          <legend>Transform</legend>

          <div className="group">
            <label
              className="inline"
              title="Change the output size, either as a percentage of the original or as exact pixels."
            >
              <input
                type="checkbox"
                checked={crop}
                onChange={(event) => setCrop(event.target.checked)}
              />
              Resize
            </label>

            {crop && imageSize !== null && (
              <div className="pairs">
                <label className="inline" title="Crop to a percentage of the original.">
                  <input
                    type="radio"
                    name="sizeMode"
                    checked={liveMode === 'percent'}
                    onChange={() => changeSizeMode('percent')}
                  />
                  By percent
                </label>

                <label className="inline" title="Resize to an exact pixel width and height.">
                  <input
                    type="radio"
                    name="sizeMode"
                    checked={liveMode === 'pixels'}
                    onChange={() => changeSizeMode('pixels')}
                  />
                  By pixels
                </label>
              </div>
            )}

            {crop && imageSize !== null && (
              <>
                <Slider
                  label="Width %"
                  tooltip="How much of the width to keep, taken from the middle."
                  min={10}
                  max={100}
                  step={1}
                  value={keepWidth}
                  disabled={liveMode !== 'percent'}
                  onChange={changeKeepWidth}
                  format={(value) => `${Math.round(value)}%`}
                />

                <Slider
                  label="Height %"
                  tooltip="How much of the height to keep, taken from the middle."
                  min={10}
                  max={100}
                  step={1}
                  value={keepHeight}
                  disabled={liveMode !== 'percent'}
                  onChange={changeKeepHeight}
                  format={(value) => `${Math.round(value)}%`}
                />
              </>
            )}

            <div className="pairs">
              {crop && (
                <>
                  <Field
                    label="Width"
                    tooltip="The width of the result, in pixels."
                    hint={liveMode === 'percent' ? 'from the sliders' : '1-4096 px'}
                  >
                    <input
                      type="number"
                      min="1"
                      max="4096"
                      value={width}
                      disabled={liveMode === 'percent'}
                      onChange={(event) => changeWidth(event.target.value)}
                    />
                  </Field>

                  <Field
                    label="Height"
                    tooltip="The height of the result, in pixels."
                    hint={liveMode === 'percent' ? 'from the sliders' : '1-4096 px'}
                  >
                    <input
                      type="number"
                      min="1"
                      max="4096"
                      value={height}
                      disabled={liveMode === 'percent'}
                      onChange={(event) => changeHeight(event.target.value)}
                    />
                  </Field>

                  <Field
                    label="Focus"
                    tooltip="What the resize keeps when it has to discard part of the image."
                    hint={focusHint}
                  >
                    <select
                      value={focus}
                      disabled={liveMode === 'percent'}
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

            {format !== 'png' && (
              <Slider
                label="Quality"
                tooltip="Encoder quality for JPEG, WebP and AVIF."
                min={1}
                max={100}
                step={1}
                value={quality}
                onChange={setQuality}
                format={(value) => String(Math.round(value))}
              />
            )}

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
                disabled={sepia}
                onChange={(event) => setGrayscale(event.target.checked)}
              />
              Grayscale
            </label>

            <label className="inline" title="Give the image a warm brown, aged tone.">
              <input
                type="checkbox"
                checked={sepia}
                disabled={grayscale}
                onChange={(event) => setSepia(event.target.checked)}
              />
              Sepia
            </label>

            <Field
              label="Watermark"
              tooltip="Text stamped onto the result, drawn over the bottom right corner."
              hint="1-64 characters"
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
              disabled={grayscale || sepia}
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
              disabled={grayscale || sepia}
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
                disabled={flop}
                onChange={(event) => setFlip(event.target.checked)}
              />
              Flip vertically
            </label>

            <label className="inline" title="Mirror the image left to right.">
              <input
                type="checkbox"
                checked={flop}
                disabled={flip}
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

            {trim && (
              <Slider
                label="Trim threshold"
                tooltip="How far a pixel may differ from the border colour and still count as border. Raise it for a JPEG, whose border compression smears."
                min={0}
                max={MAX_TRIM_THRESHOLD}
                step={1}
                value={trimThreshold}
                onChange={setTrimThreshold}
                format={(value) => String(Math.round(value))}
              />
            )}

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
                hint="1-4096 px"
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
                tooltip="The colour used for padding and flattening."
                hint="Any hex colour"
              >
                <span className="color-field">
                  <input
                    className="color-input"
                    type="color"
                    value={background}
                    disabled={!useBackground || !paintsBackground}
                    onChange={(event) => setBackground(event.target.value)}
                  />
                  <span className="color-wheel" />
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
              Use the background for padding and flattening
            </label>
          </div>
        </fieldset>

        <div className="group">
          <Button
            type="submit"
            variant="primary"
            disabled={busy}
            title="Upload the images and queue the transform for the worker."
          >
            {busy ? 'Uploading...' : 'Upload'}
          </Button>

          {error !== null && <p className="notice">{error}</p>}

          {progress !== null && <p className="status">{progress}</p>}

          {summary !== null && <p className="status">{summary}</p>}

          {emailNotice && (
            <p className="notice notice--info">
              Upload complete. Your images are being processed. You can close this tab; we'll email you when they're ready.
            </p>
          )}

        </div>
      </form>
    </Panel>
  );
}
