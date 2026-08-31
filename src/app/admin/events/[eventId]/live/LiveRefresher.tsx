'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const INTERVAL_MS = 8000;

/** Keeps the Technical Director's screen current without a manual reload. */
export function LiveRefresher() {
  const router = useRouter();
  const [enabled, setEnabled] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setLastRefreshed(new Date());
  }, []);

  useEffect(() => {
    if (!enabled) return;

    timerRef.current = setInterval(() => {
      if (document.hidden) return;
      router.refresh();
      setLastRefreshed(new Date());
    }, INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, router]);

  return (
    <div className="flex items-center gap-2 text-xs text-ink-muted">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${enabled ? 'bg-green-500' : 'bg-slate-300'}`} />
      <span>{enabled ? 'Auto-refreshing' : 'Paused'}</span>
      {lastRefreshed && (
        <span className="hidden sm:inline">
          · updated{' '}
          {lastRefreshed.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      )}
      <button type="button" className="btn-quiet btn-sm" onClick={() => setEnabled((e) => !e)}>
        {enabled ? 'Pause' : 'Resume'}
      </button>
    </div>
  );
}
