'use client';

import { useActionState } from 'react';
import { updateOfficial, type AdminState } from '@/actions/admin';
import { SubmitButton } from '@/components/SubmitButton';
import { EventIdField } from '@/components/EventIdField';

export function OfficialRow({
  official,
  mats,
}: {
  official: {
    id: string;
    name: string;
    email: string;
    certification: string | null;
    assignedMatId: string | null;
    isJury: boolean;
    active: boolean;
    boutCount: number;
    scoreCount: number;
  };
  mats: { id: string; name: string }[];
}) {
  const [state, action] = useActionState<AdminState, FormData>(updateOfficial, null);

  return (
    <tr className={official.active ? '' : 'opacity-55'}>
      <td className="whitespace-nowrap font-medium text-ink">
        {official.name}
        {official.certification && <span className="block text-xs text-ink-muted">{official.certification}</span>}
        {state?.error && <span className="block text-xs text-tkd-red">{state.error}</span>}
        {state?.message && <span className="block text-xs text-emerald-700">{state.message}</span>}
      </td>
      <td className="text-xs">{official.email}</td>
      <td className="text-xs">{official.isJury ? 'Referee + jury' : 'Referee'}</td>
      <td className="num text-xs">
        {official.boutCount} bouts
        <span className="block text-ink-muted">{official.scoreCount} scores</span>
      </td>
      <td colSpan={2} className="p-0">
        <form action={action} className="flex flex-wrap items-center gap-2 px-3 py-2">
          <EventIdField />
          <input type="hidden" name="userId" value={official.id} />

          <select
            name="assignedMatId"
            defaultValue={official.assignedMatId ?? ''}
            className="select !w-28 !py-1 !text-xs"
            aria-label={`Mat for ${official.name}`}
          >
            <option value="">No mat</option>
            {mats.map((mat) => (
              <option key={mat.id} value={mat.id}>
                {mat.name}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-1.5 text-xs text-ink-soft">
            <input type="checkbox" name="isJury" defaultChecked={official.isJury} className="checkbox !h-3.5 !w-3.5" />
            Jury
          </label>

          <label className="flex items-center gap-1.5 text-xs text-ink-soft">
            <input type="checkbox" name="active" defaultChecked={official.active} className="checkbox !h-3.5 !w-3.5" />
            Active
          </label>

          <input
            type="password"
            name="newPassword"
            placeholder="Reset password"
            className="input !w-32 !py-1 !text-xs"
            aria-label={`New password for ${official.name}`}
          />

          <SubmitButton className="btn-ghost btn-sm" pendingLabel="…">
            Save
          </SubmitButton>
        </form>
      </td>
    </tr>
  );
}
