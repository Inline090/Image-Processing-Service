import type { CSSProperties } from 'react';

type Props = {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;

  step?: number;

  tooltip?: string;

  format?: (value: number) => string;
  disabled?: boolean;
};

// A bounded control that prints its live value and its limits.
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
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
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
