import type { ReactNode } from 'react';

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = '',
  bodyClassName = 'card-pad',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <div className="min-w-0">
            {title && <h2 className="card-title">{title}</h2>}
            {subtitle && <p className="card-sub">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children && <div className={bodyClassName}>{children}</div>}
    </section>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-muted">{hint}</div>}
    </div>
  );
}

const STATUS_CLASS: Record<string, string> = {
  APPROVED: 'badge-green',
  PAID: 'badge-green',
  COMPLETED: 'badge-green',
  PUBLISHED: 'badge-green',
  ACTIVE: 'badge-green',
  PENDING: 'badge-amber',
  PARTIAL: 'badge-amber',
  IN_PROGRESS: 'badge-amber',
  GENERATED: 'badge-amber',
  SCHEDULED: 'badge-neutral',
  DRAFT: 'badge-neutral',
  BYE: 'badge-neutral',
  UNPAID: 'badge-red',
  REJECTED: 'badge-red',
  WITHDRAWN: 'badge-red',
  DISQUALIFIED: 'badge-red',
  LOCKED: 'badge-blue',
  WAIVED: 'badge-blue',
  GOLD: 'badge-gold',
  SILVER: 'badge-silver',
  BRONZE: 'badge-bronze',
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const cls = STATUS_CLASS[status] ?? 'badge-neutral';
  const text = label ?? status.replace(/_/g, ' ').toLowerCase();
  return <span className={cls}>{text.charAt(0).toUpperCase() + text.slice(1)}</span>;
}

export function Empty({ title, hint, action }: { title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-surface-line bg-surface-sunk/40 px-6 py-12 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="max-w-md text-sm leading-relaxed text-ink-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Field({
  label,
  name,
  children,
  hint,
  required,
  className = '',
}: {
  label: string;
  name?: string;
  children: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={name}>
        {label}
        {required && <span className="ml-1 text-tkd-red">*</span>}
      </label>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function Notice({
  kind = 'info',
  children,
}: {
  kind?: 'info' | 'warn' | 'error' | 'ok';
  children: ReactNode;
}) {
  return <div className={`notice-${kind}`}>{children}</div>;
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

export function KeyValue({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map(([key, value]) => (
        <div key={key}>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{key}</dt>
          <dd className="mt-0.5 text-sm text-ink">{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function MedalPips({ gold, silver, bronze }: { gold: number; silver: number; bronze: number }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-semibold tabular-nums">
      <span className="inline-flex items-center gap-1 text-amber-700">
        <span className="h-2 w-2 rounded-full bg-tkd-gold" />
        {gold}
      </span>
      <span className="inline-flex items-center gap-1 text-slate-500">
        <span className="h-2 w-2 rounded-full bg-tkd-silver" />
        {silver}
      </span>
      <span className="inline-flex items-center gap-1 text-orange-800">
        <span className="h-2 w-2 rounded-full bg-tkd-bronze" />
        {bronze}
      </span>
    </span>
  );
}
