import type { ReactNode } from 'react';

type Props = {
  label: string;
  tooltip?: string;
  hint?: string;
  children: ReactNode;
};

export function Field({ label, tooltip, hint, children }: Props) {
  return (
    <label className="field" title={tooltip}>
      <span className="field-label label">{label}</span>
      {children}
      {hint !== undefined && <span className="field-hint">{hint}</span>}
    </label>
  );
}
