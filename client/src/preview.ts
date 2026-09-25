import type { TransformOptions } from './api';

export type PreviewStyle = {
  filter?: string;
  transform?: string;
  clipPath?: string;
  backgroundColor?: string;
};

const NEUTRAL_BRIGHTNESS = 1;
const NEUTRAL_SATURATION = 1;
const NEUTRAL_HUE = 0;
const NEUTRAL_LIGHTNESS = 50;

// Contrast is the closest thing CSS has to a lightness offset.
function lightnessToContrast(lightness: number): number {
  const delta = (lightness - NEUTRAL_LIGHTNESS) / 100;

  return Math.max(0.1, Number((1 + delta * 2).toFixed(2)));
}

// The crop is measured in pixels of the original, so it is turned into percentages.
function cropClip(
  options: TransformOptions,
  size: { width: number; height: number },
): string | undefined {
  const crop = options.crop;

  if (crop === undefined || size.width <= 0 || size.height <= 0) {
    return undefined;
  }

  const round = (value: number): number => Number(value.toFixed(3));
  const left = round((crop.left / size.width) * 100);
  const top = round((crop.top / size.height) * 100);
  const right = round(100 - ((crop.left + crop.width) / size.width) * 100);
  const bottom = round(100 - ((crop.top + crop.height) / size.height) * 100);

  return `inset(${top}% ${right}% ${bottom}% ${left}%)`;
}

function geometry(options: TransformOptions): string | undefined {
  const parts: string[] = [];

  if (options.rotate !== undefined && options.rotate !== 0) {
    parts.push(`rotate(${options.rotate}deg)`);
  }

  if (options.flip === true) {
    parts.push('scaleX(-1)');
  }

  if (options.flop === true) {
    parts.push('scaleY(-1)');
  }

  return parts.length === 0 ? undefined : parts.join(' ');
}

// Turns the options the form will send into something the browser can show right away.
export function previewStyle(
  options: TransformOptions,
  size: { width: number; height: number } | null,
): PreviewStyle {
  const filters: string[] = [];
  const modulate = options.modulate;

  if (modulate?.brightness !== undefined && modulate.brightness !== NEUTRAL_BRIGHTNESS) {
    filters.push(`brightness(${modulate.brightness})`);
  }

  if (modulate?.saturation !== undefined && modulate.saturation !== NEUTRAL_SATURATION) {
    filters.push(`saturate(${modulate.saturation})`);
  }

  if (modulate?.hue !== undefined && modulate.hue !== NEUTRAL_HUE) {
    filters.push(`hue-rotate(${modulate.hue}deg)`);
  }

  if (modulate?.lightness !== undefined && modulate.lightness !== NEUTRAL_LIGHTNESS) {
    filters.push(`contrast(${lightnessToContrast(modulate.lightness)})`);
  }

  if (options.blur !== undefined) {
    filters.push(`blur(${options.blur}px)`);
  }

  if (options.grayscale === true) {
    filters.push('grayscale(1)');
  }

  if (options.sepia === true) {
    filters.push('sepia(1)');
  }

  const style: PreviewStyle = {};
  const transform = geometry(options);
  const clipPath = size === null ? undefined : cropClip(options, size);

  if (filters.length > 0) {
    style.filter = filters.join(' ');
  }

  if (transform !== undefined) {
    style.transform = transform;
  }

  if (clipPath !== undefined) {
    style.clipPath = clipPath;
  }

  if (options.flatten === true && options.background !== undefined) {
    style.backgroundColor = options.background;
  }

  return style;
}
