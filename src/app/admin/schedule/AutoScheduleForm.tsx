'use client';

import { useActionState } from 'react';
import { autoScheduleAction, type AdminState } from '@/actions/admin';
import { SubmitButton } from '@/components/SubmitButton';
import { FormMessage } from '@/components/FormMessage';
import { Card, Field } from '@/components/ui';

export function AutoScheduleForm({ defaultStart }: { defaultStart: string }) {
  const [state, action] = useActionState<AdminState, FormData>(autoScheduleAction, null);

  return (
    <Card
      title="Auto-assign mats and times"
      subtitle="Fills the earliest-free mat bout by bout, earlier rounds first, so no bracket runs ahead of its feeder bouts."
    >
      <form action={action} className="space-y-4">
        <FormMessage state={state} />

        <div className="grid gap-4 sm:grid-cols-[1fr_180px_auto] sm:items-end">
          <Field label="First bout starts" name="startAt" required>
            <input id="startAt" name="startAt" type="datetime-local" required defaultValue={defaultStart} className="input" />
          </Field>

          <Field label="Minutes per bout" name="minutes" required>
            <input id="minutes" name="minutes" type="number" min="3" max="60" required defaultValue="12" className="input" />
          </Field>

          <SubmitButton
            className="btn-dark"
            pendingLabel="Assigning…"
            confirm="Reassign every scheduled bout across the active mats? Existing mat and time assignments will be overwritten."
          >
            Auto-assign
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}
