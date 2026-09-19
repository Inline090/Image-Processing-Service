import type { ReactNode } from 'react';

type Props = {
  title: string;
  lede?: string;
  kicker?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function Panel({ title, lede, kicker, actions, children }: Props) {
  return (
    <section className="panel">
      {kicker !== undefined && <span className="kicker label">{kicker}</span>}

      <header className="panel-header">
        <div>
          <h2 className="panel-title">{title}</h2>
          {lede !== undefined && <p className="prose panel-lede">{lede}</p>}
        </div>

        {actions}
      </header>

      {children}
    </section>
  );
}
