const EXTENSIONS: Record<string, string> = {
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const FALLBACK_EXTENSION = 'bin';
const MAX_STEM_LENGTH = 64;

// The stored name is client input, so separators and control characters go.
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

// The extension follows the bytes being sent, not the name it arrived with.
export function downloadFilename(
  originalName: string | null,
  id: string,
  mimeType: string,
): string {
  return `${stem(originalName, id)}.${extensionFor(mimeType)}`;
}

export function contentDisposition(filename: string): string {
  const encoded = encodeURIComponent(filename).replace(
    /['()!*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `attachment; filename*=UTF-8''${encoded}`;
}
