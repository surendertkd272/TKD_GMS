'use client';

import { useActionState } from 'react';
import { updateBoutSchedule, type AdminState } from '@/actions/admin';
import { SubmitButton } from '@/components/SubmitButton';
import { StatusBadge } from '@/components/ui';
import { EventIdField } from '@/components/EventIdField';

export function BoutScheduleRow({
  bout,
  mats,
  referees,
}: {
  bout: {
    id: string;
    boutNumber: number;
    categoryName: string;
    roundLabel: string;
    red: string;
    blue: string;
    matId: string | null;
    scheduledAt: string;
    refereeId: string | null;
    status: string;
    conflicted: boolean;
  };
  mats: { id: string; name: string; active: boolean }[];
  referees: { id: string; name: string }[];
}) {
  const [state, action] = useActionState<AdminState, FormData>(updateBoutSchedule, null);

  return (
    <tr className={bout.conflicted ? 'bg-red-50/60' : ''}>
      <td className="num text-ink-muted">{bout.boutNumber || '—'}</td>
      <td className="min-w-[160px]">
        <span className="block text-[13px] font-medium text-ink">{bout.categoryName}</span>
        <span className="block text-xs text-ink-muted">{bout.roundLabel}</span>
        {state?.error && <span className="mt-1 block text-xs text-tkd-red">{state.error}</span>}
      </td>
      <td className="whitespace-nowrap text-xs text-tkd-red">{bout.red}</td>
      <td className="whitespace-nowrap text-xs text-tkd-blue">{bout.blue}</td>
      <td colSpan={4} className="p-0">
        <form action={action} className="flex items-center gap-2 px-3 py-2">
          <EventIdField />
          <input type="hidden" name="boutId" value={bout.id} />

          <select name="matId" defaultValue={bout.matId ?? ''} className="select !w-28 !py-1 !text-xs" aria-label="Mat">
            <option value="">No mat</option>
            {mats.map((mat) => (
              <option key={mat.id} value={mat.id} disabled={!mat.active}>
                {mat.name}
                {mat.active ? '' : ' (off)'}
              </option>
            ))}
          </select>

          <input
            type="datetime-local"
            name="scheduledAt"
            defaultValue={bout.scheduledAt}
            className="input !w-44 !py-1 !text-xs"
            aria-label="Scheduled time"
          />

          <select
            name="refereeId"
            defaultValue={bout.refereeId ?? ''}
            className="select !w-36 !py-1 !text-xs"
            aria-label="Referee"
          >
            <option value="">No referee</option>
            {referees.map((referee) => (
              <option key={referee.id} value={referee.id}>
                {referee.name}
              </option>
            ))}
          </select>

          <SubmitButton className="btn-ghost btn-sm" pendingLabel="…">
            Save
          </SubmitButton>
        </form>
      </td>
      <td>
        <StatusBadge status={bout.status} />
      </td>
    </tr>
  );
}
