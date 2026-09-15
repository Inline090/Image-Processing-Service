import sharp from 'sharp';

export type ResizeFit = 'cover' | 'contain' | 'fill' | 'inside' | 'outside';

export type WatermarkPosition =
  | 'northwest'
  | 'north'
  | 'northeast'
  | 'west'
  | 'center'
  | 'east'
  | 'southwest'
  | 'south'
  | 'southeast';

export type TransformOptions = {
  width?: number;
  height?: number;
  fit?: ResizeFit;
  rotate?: number;
  crop?: { left: number; top: number; width: number; height: number };
  grayscale?: boolean;
  sepia?: boolean;
  format?: 'jpeg' | 'png' | 'webp';
  watermark?: { text: string; position?: WatermarkPosition };
};

export type TransformResult = {
  buffer: Buffer;
  format: string;
  width: number;
  height: number;
};

const SVG_ESCAPES: Record<string, string> = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  "'": '&apos;',
  '"': '&quot;',
};

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (char) => SVG_ESCAPES[char] ?? char);
}

function watermarkOverlay(text: string): Buffer {
  const label = escapeXml(text);
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="64">' +
    '<text x="12" y="42" font-family="sans-serif" font-size="28" fill="#ffffff" fill-opacity="0.85">' +
    label +
    '</text></svg>';

  return Buffer.from(svg);
}

export async function transformImage(
  input: Buffer,
  options: TransformOptions,
): Promise<TransformResult> {
  let pipeline = sharp(input).autoOrient();

  if (options.rotate !== undefined) {
    pipeline = pipeline.rotate(options.rotate);
  }

  if (options.crop !== undefined) {
    pipeline = pipeline.extract(options.crop);
  }

  if (options.grayscale === true) {
    pipeline = pipeline.grayscale();
  }

  if (options.sepia === true) {
    pipeline = pipeline.grayscale().tint({ r: 112, g: 66, b: 20 });
  }

  if (options.width !== undefined || options.height !== undefined) {
    pipeline = pipeline.resize({
      width: options.width,
      height: options.height,
      fit: options.fit ?? 'cover',
    });
  }

  if (options.watermark !== undefined) {
    pipeline = pipeline.composite([
      {
        input: watermarkOverlay(options.watermark.text),
        gravity: options.watermark.position ?? 'southeast',
      },
    ]);
  }

  if (options.format === 'jpeg') {
    pipeline = pipeline.jpeg({ quality: 82 });
  } else if (options.format === 'png') {
    pipeline = pipeline.png();
  } else if (options.format === 'webp') {
    pipeline = pipeline.webp({ quality: 82 });
  }

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    format: info.format,
    width: info.width,
    height: info.height,
  };
}
