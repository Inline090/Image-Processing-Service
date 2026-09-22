import { getDownload, type DownloadVariant } from './api';

// The browser saves under the filename signed into the url.
export async function downloadImage(imageId: string, variant: DownloadVariant): Promise<void> {
  const { url, filename } = await getDownload(imageId, variant);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.rel = 'noopener';

  document.body.append(link);
  link.click();
  link.remove();
}
