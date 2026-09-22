type Props = {
  size?: number;
};

// Inline spinner for anything still pending.
export function Loader({ size = 18 }: Props) {
  return (
    <svg
      className="loader"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      focusable="false"
    >
      <circle className="loader-track" cx="12" cy="12" r="9" />
      <circle className="loader-arc" cx="12" cy="12" r="9" />
    </svg>
  );
}
