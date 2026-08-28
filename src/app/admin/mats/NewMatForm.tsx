'use client';

import { useActionState } from 'react';
import { saveMat, type AdminState } from '@/actions/admin';
import { SubmitButton } from '@/components/SubmitButton';
import { FormMessage } from '@/components/FormMessage';
import { Card, Field } from '@/components/ui';

export function NewMatForm() {
  const [state, action] = useActionState<AdminState, FormData>(saveMat, null);

  return (
    <Card title="Add a mat">
      <form action={action} className="space-y-4">
        <FormMessage state={state} />

        <Field label="Mat name" name="name" required>
          <input id="name" name="name" required className="input" placeholder="Mat 5" />
        </Field>

        <Field label="Venue / hall" name="venue">
          <input id="venue" name="venue" className="input" placeholder="Main hall" />
        </Field>

        <SubmitButton className="btn-primary w-full" pendingLabel="Adding…">
          Add mat
        </SubmitButton>
      </form>
    </Card>
  );
}
