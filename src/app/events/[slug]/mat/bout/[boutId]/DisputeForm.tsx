'use client';

import { useActionState, useState } from 'react';
import { flagDispute, type RefereeState } from '@/actions/referee';
import { SubmitButton } from '@/components/SubmitButton';
import { FormMessage } from '@/components/FormMessage';
import { Card, Field } from '@/components/ui';

export function DisputeForm({ boutId }: { boutId: string }) {
  const [state, action] = useActionState<RefereeState, FormData>(flagDispute, null);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Card title="Review or dispute" subtitle="Raise a bout with the Technical Director without leaving the mat.">
        <FormMessage state={state} />
        <button type="button" onClick={() => setOpen(true)} className="btn-ghost w-full">
          Flag for review
        </button>
      </Card>
    );
  }

  return (
    <Card title="Flag for the Technical Director">
      <form action={action} className="space-y-4">
        <FormMessage state={state} />
        <input type="hidden" name="boutId" value={boutId} />

        <Field label="What needs reviewing?" name="note" required>
          <textarea
            id="note"
            name="note"
            required
            className="textarea"
            placeholder="e.g. Coach has requested a video review of the third-round head kick."
          />
        </Field>

        <div className="flex gap-2">
          <SubmitButton className="btn-danger flex-1" pendingLabel="Flagging…">
            Raise flag
          </SubmitButton>
          <button type="button" onClick={() => setOpen(false)} className="btn-quiet">
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
