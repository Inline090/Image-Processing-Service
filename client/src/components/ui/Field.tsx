import type { ReactNode } from 'react';

type Props = {
  label: string;
  /**
   * Keeps the label in the accessibility tree but removes it visually, for
   * places like the sign-in card where a placeholder carries the hint and the
   * fields are self-evident. The name is still announced, so the field is never
   * unlabelled.
   */
  hideLabel?: boolean;
  /** Hover text describing what the option does. Applied to the whole field. */
  tooltip?: string;
  /** Always-visible line under the control, for the accepted values. */
  hint?: string;
  children: ReactNode;
};

export function Field({ label, hideLabel = false, tooltip, hint, children }: Props) {
  return (
    <label className="field" title={tooltip}>
      <span className={hideLabel ? 'field-label sr-only' : 'field-label label'}>{label}</span>
      {children}
      {hint !== undefined && <span className="field-hint">{hint}</span>}
    </label>
  );
}
