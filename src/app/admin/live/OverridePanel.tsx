'use client';

import { useActionState, useState } from 'react';
import { overrideBoutResult, type AdminState } from '@/actions/admin';
import { SubmitButton } from '@/components/SubmitButton';
import { FormMessage } from '@/components/FormMessage';
import { Field } from '@/components/ui';
import { RESULT_TYPES, RESULT_TYPE_LABEL, type ResultType } from '@/lib/constants';

export function OverridePanel({
  boutId,
  red,
  blue,
  redScore,
  blueScore,
  status,
}: {
  boutId: string;
  red: string | null;
  blue: string | null;
  redScore: number;
  blueScore: number;
  status: string;
}) {
  const [state, action] = useActionState<AdminState, FormData>(overrideBoutResult, null);
  const [winner, setWinner] = useState<'RED' | 'BLUE' | ''>('');

  return (
    <form action={action} className="space-y-5">
      <FormMessage state={state} />
      <input type="hidden" name="boutId" value={boutId} />

      {status === 'COMPLETED' && (
        <p className="notice-warn">
          This bout is already completed. Submitting again overwrites the recorded result and
          re-advances the winner.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            { side: 'RED' as const, name: red, accent: 'border-tkd-red/50 bg-tkd-red/[0.04]', dot: 'bg-tkd-red' },
            { side: 'BLUE' as const, name: blue, accent: 'border-tkd-blue/50 bg-tkd-blue/[0.04]', dot: 'bg-tkd-blue' },
          ]
        ).map((corner) => (
          <label
            key={corner.side}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3.5 transition-colors ${
              winner === corner.side ? corner.accent : 'border-surface-line hover:bg-surface-sunk/60'
            } ${!corner.name ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            <input
              type="radio"
              name="winner"
              value={corner.side}
              disabled={!corner.name}
              checked={winner === corner.side}
              onChange={() => setWinner(corner.side)}
              className="h-4 w-4 text-tkd-red focus:ring-tkd-red/30"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                <span className={`h-2 w-2 rounded-full ${corner.dot}`} />
                {corner.side} corner
              </span>
              <span className="mt-0.5 block truncate text-sm font-medium text-ink">
                {corner.name ?? 'Not assigned'}
              </span>
            </span>
          </label>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Result type" name="resultType" required>
          <select id="resultType" name="resultType" className="select" defaultValue="POINTS">
            {RESULT_TYPES.map((type) => (
              <option key={type} value={type}>
                {RESULT_TYPE_LABEL[type as ResultType]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Red score" name="redScore">
          <input id="redScore" name="redScore" type="number" min="0" defaultValue={redScore} className="input" />
        </Field>

        <Field label="Blue score" name="blueScore">
          <input id="blueScore" name="blueScore" type="number" min="0" defaultValue={blueScore} className="input" />
        </Field>
      </div>

      <SubmitButton
        className="btn-primary"
        pendingLabel="Recording…"
        confirm="Record this result and advance the bracket?"
      >
        Record result
      </SubmitButton>
    </form>
  );
}
