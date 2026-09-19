import type { CSSProperties } from 'react';

type Props = {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  /** Granularity of the control, in the option's own units. */
  step?: number;
  /** Hover text describing what the option does. */
  tooltip?: string;
  /** Prints a value: used for the live reading and the two end captions. */
  format?: (value: number) => string;
  disabled?: boolean;
};

/**
 * A bounded adjustment. The reading sits beside the label and the two ends of
 * the range sit under the track, so the accepted values are visible without
 * hovering — the slider shows the range instead of a hint restating it.
 */
export function Slider({
  label,
  min,
  max,
  value,
  onChange,
  step = 1,
  tooltip,
  format,
  disabled = false,
}: Props) {
  const fraction = max === min ? 0 : (value - min) / (max - min);
  const print = format ?? String;

  return (
    <div className="slider-field" title={tooltip}>
      <span className="slider-head">
        <span className="field-label label">{label}</span>
        <span className="slider-value">{print(value)}</span>
      </span>

      <input
        className="slider"
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        // Drives the filled part of the track, so the accent ends exactly under
        // the thumb rather than at a fixed width.
        style={{ '--fill': `${fraction * 100}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />

      <span className="slider-bounds">
        <span>{print(min)}</span>
        <span>{print(max)}</span>
      </span>
    </div>
  );
}
