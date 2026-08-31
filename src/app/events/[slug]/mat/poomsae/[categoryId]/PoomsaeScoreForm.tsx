'use client';

import { useActionState, useState } from 'react';
import { submitPoomsaeScore, type RefereeState } from '@/actions/referee';
import { SubmitButton } from '@/components/SubmitButton';
import { FormMessage } from '@/components/FormMessage';
import { MAX_ACCURACY, MAX_PRESENTATION } from '@/lib/poomsae';

/**
 * One row per performer. Accuracy is deducted from 4.0 and presentation from 6.0,
 * which is how a judge actually works — so both start at maximum.
 */
export function PoomsaeScoreForm({
  entryId,
  athleteName,
  schoolCode,
  order,
  existing,
  disabled,
}: {
  entryId: string;
  athleteName: string;
  schoolCode: string;
  order: number | null;
  existing: { accuracy: number; presentation: number; total: number } | null;
  disabled: boolean;
}) {
  const [state, action] = useActionState<RefereeState, FormData>(submitPoomsaeScore, null);

  const [accuracy, setAccuracy] = useState(existing?.accuracy ?? MAX_ACCURACY);
  const [presentation, setPresentation] = useState(existing?.presentation ?? MAX_PRESENTATION);

  const total = Math.round((accuracy + presentation) * 100) / 100;

  return (
    <form action={action} className="border-b border-surface-line px-5 py-4 last:border-b-0">
      <input type="hidden" name="entryId" value={entryId} />
      <input type="hidden" name="accuracy" value={accuracy} />
      <input type="hidden" name="presentation" value={presentation} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-base font-semibold leading-tight text-ink">
            {order != null && <span className="num mr-2 text-ink-muted">{order}.</span>}
            {athleteName}
          </p>
          <p className="text-xs text-ink-muted">{schoolCode}</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold tabular-nums leading-none text-ink">{total.toFixed(2)}</p>
          <p className="text-[11px] uppercase tracking-wide text-ink-muted">of 10.00</p>
        </div>
      </div>

      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        {(
          [
            { key: 'accuracy' as const, label: 'Accuracy', max: MAX_ACCURACY, value: accuracy, set: setAccuracy },
            { key: 'presentation' as const, label: 'Presentation', max: MAX_PRESENTATION, value: presentation, set: setPresentation },
          ] as const
        ).map((axis) => (
          <div key={axis.key}>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                {axis.label}
              </span>
              <span className="num text-sm font-semibold text-ink">
                {axis.value.toFixed(1)} / {axis.max.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={axis.max}
              step={0.1}
              value={axis.value}
              disabled={disabled}
              onChange={(e) => axis.set(Number.parseFloat(e.target.value))}
              className="w-full accent-tkd-red"
              aria-label={`${axis.label} for ${athleteName}`}
            />
            <div className="mt-2 flex gap-1.5">
              {[0.1, 0.3, 0.5].map((step) => (
                <button
                  key={step}
                  type="button"
                  disabled={disabled}
                  onClick={() => axis.set(Math.max(0, Math.round((axis.value - step) * 10) / 10))}
                  className="btn-ghost btn-sm flex-1"
                >
                  −{step.toFixed(1)}
                </button>
              ))}
              <button
                type="button"
                disabled={disabled}
                onClick={() => axis.set(axis.max)}
                className="btn-quiet btn-sm"
              >
                Reset
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          name="note"
          placeholder="Optional note (visible to the organising team)"
          className="input flex-1 !py-1.5 !text-xs"
          disabled={disabled}
        />
        <SubmitButton className="btn-primary" pendingLabel="Saving…">
          {existing ? 'Update score' : 'Submit score'}
        </SubmitButton>
      </div>

      {existing && !state && (
        <p className="mt-2 text-xs text-emerald-700">
          You already scored this performer {existing.total.toFixed(2)} — submitting replaces it.
        </p>
      )}
      <div className="mt-2">
        <FormMessage state={state} />
      </div>
    </form>
  );
}
