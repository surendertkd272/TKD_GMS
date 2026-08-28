import Link from 'next/link';

export function Brand({
  eventName,
  edition,
  href = '/',
  compact = false,
  invert = false,
}: {
  eventName: string;
  edition: string;
  href?: string;
  compact?: boolean;
  invert?: boolean;
}) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[13px] font-bold tracking-tight ${
          invert ? 'bg-white text-tkd-red' : 'bg-tkd-red text-white'
        }`}
        aria-hidden
      >
        태
      </span>
      <span className="min-w-0">
        <span
          className={`block truncate text-[13px] font-semibold leading-tight tracking-tight ${
            invert ? 'text-white' : 'text-ink'
          }`}
        >
          {compact ? 'P.R.S Nair Championship' : eventName}
        </span>
        <span
          className={`block text-[11px] leading-tight ${invert ? 'text-white/70' : 'text-ink-muted'}`}
        >
          Game Management System · {edition}
        </span>
      </span>
    </Link>
  );
}
