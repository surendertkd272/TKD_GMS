'use client';

import { useActionState } from 'react';
import { requestPasswordReset, type ResetState } from '@/actions/password-reset';
import { SubmitButton } from '@/components/SubmitButton';
import { FormMessage } from '@/components/FormMessage';
import { Card, Field } from '@/components/ui';

export function ForgotPasswordForm({ eventId }: { eventId: string }) {
  const [state, action] = useActionState<ResetState, FormData>(requestPasswordReset, null);

  return (
    <Card>
      <form action={action} className="space-y-5">
        <input type="hidden" name="eventId" value={eventId} />
        <FormMessage state={state} />

        <Field label="Email" name="email" required>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </Field>

        <SubmitButton className="btn-primary w-full" pendingLabel="Sending…">
          Send the reset link
        </SubmitButton>
      </form>
    </Card>
  );
}
