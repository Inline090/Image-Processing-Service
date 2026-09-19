import type { ReactNode } from 'react';

type Props = {
  label: string;
  children: ReactNode;
};

// The label wraps the control, so the association is implicit and needs no id.
export function Field({ label, children }: Props) {
  return (
    <label className="field">
      <span className="field-label small-caps">{label}</span>
      {children}
    </label>
  );
}
