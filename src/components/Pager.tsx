import Link from 'next/link';

/**
 * Page links that keep every other filter in the URL — a list you have narrowed
 * down should stay narrowed when you turn the page.
 */
export function Pager({
  page,
  pageSize,
  total,
  basePath,
  params,
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  const href = (target: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) query.set(key, value);
    }
    if (target > 1) query.set('page', String(target));
    const qs = query.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-line px-5 py-3">
      <p className="text-xs text-ink-muted">
        Showing <span className="num text-ink-soft">{from}</span>–
        <span className="num text-ink-soft">{to}</span> of{' '}
        <span className="num text-ink-soft">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className="btn-quiet btn-sm">
            ← Previous
          </Link>
        ) : (
          <span className="btn-quiet btn-sm pointer-events-none opacity-40">← Previous</span>
        )}
        <span className="text-xs text-ink-muted">
          Page <span className="num text-ink-soft">{page}</span> of{' '}
          <span className="num text-ink-soft">{pages}</span>
        </span>
        {page < pages ? (
          <Link href={href(page + 1)} className="btn-quiet btn-sm">
            Next →
          </Link>
        ) : (
          <span className="btn-quiet btn-sm pointer-events-none opacity-40">Next →</span>
        )}
      </div>
    </div>
  );
}
