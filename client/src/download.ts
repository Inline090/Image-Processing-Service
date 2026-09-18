import { getDownload, type DownloadVariant } from './api';

// The bucket is a different origin, so the download attribute is ignored there
// and the signed Content-Disposition on the url decides the saved name.
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
