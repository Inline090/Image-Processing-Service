import type { ReactNode } from 'react';

type Props = {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  accentTop?: boolean;
  children: ReactNode;
};

export function Panel({ title, eyebrow, actions, accentTop = false, children }: Props) {
  return (
    <section className={accentTop ? 'panel panel--accent' : 'panel'}>
      {eyebrow !== undefined && <p className="small-caps">{eyebrow}</p>}

      <header className="panel-header">
        <h2 className="panel-title">{title}</h2>
        {actions}
      </header>

      {children}
    </section>
  );
}
