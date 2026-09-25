import type { TransformOptions } from '../api';
import { previewStyle } from '../preview';

type Props = {
  src: string;
  options: TransformOptions;
  size: { width: number; height: number } | null;
};

export function LivePreview({ src, options, size }: Props) {
  const pending =
    options.trim !== undefined || options.extend !== undefined
      ? 'Trim and extend appear after the image is processed.'
      : null;

  return (
    <div className="live-preview">
      <img src={src} alt="" style={previewStyle(options, size)} />

      {pending !== null && <p className="field-hint">{pending}</p>}
    </div>
  );
}
