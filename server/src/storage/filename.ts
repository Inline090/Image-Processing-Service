const EXTENSIONS: Record<string, string> = {
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/tiff': 'tiff',
  'image/webp': 'webp',
};

const FALLBACK_EXTENSION = 'bin';
const MAX_STEM_LENGTH = 64;

// The stored name came from the client, so it is treated as hostile: control
// characters would allow header injection, and separators would let the browser
// save outside the intended folder.
function safeStem(name: string): string {
  const printable = Array.from(name)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;

      return code >= 0x20 && code !== 0x7f;
    })
    .join('');

  return printable
    .replace(/["'<>|:*?\\/]/g, '')
    .trim()
    .slice(0, MAX_STEM_LENGTH);
}

function stem(originalName: string | null, id: string): string {
  const base = (originalName ?? '').split(/[\\/]/).pop() ?? '';
  const withoutExtension = base.replace(/\.[^.]*$/, '');
  const cleaned = safeStem(withoutExtension);

  return cleaned === '' ? `image-${id.slice(0, 8)}` : cleaned;
}

function extensionFor(mimeType: string): string {
  return EXTENSIONS[mimeType.toLowerCase()] ?? FALLBACK_EXTENSION;
}

// The extension follows the bytes that are actually being sent, not the name the
// file arrived with, so a jpeg transformed to webp downloads as .webp.
export function downloadFilename(
  originalName: string | null,
  id: string,
  mimeType: string,
): string {
  return `${stem(originalName, id)}.${extensionFor(mimeType)}`;
}

export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\u0020-\u007e]/g, '_').replace(/["\\]/g, '');
  const encoded = encodeURIComponent(filename).replace(
    /['()!*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
