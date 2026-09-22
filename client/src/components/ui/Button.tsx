import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'outline' | 'ghost' | 'link';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
};

// Four variants, one size.
export function Button({
  variant = 'ghost',
  type = 'button',
  className,
  children,
  ...rest
}: Props) {
  const classes = ['btn', `btn--${variant}`, className].filter(Boolean).join(' ');

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
