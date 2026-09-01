'use client';

import { useActionState } from 'react';
import { completePasswordReset, type ResetState } from '@/actions/password-reset';
import { SubmitButton } from '@/components/SubmitButton';
import { FormMessage } from '@/components/FormMessage';
import { Card, Field } from '@/components/ui';
import { MIN_PASSWORD_LENGTH, PASSWORD_HINT } from '@/lib/constants';

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState<ResetState, FormData>(completePasswordReset, null);

  return (
    <Card>
      <form action={action} className="space-y-5">
        <input type="hidden" name="token" value={token} />
        <FormMessage state={state} />

        <Field label="New password" name="password" required hint={PASSWORD_HINT}>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            className="input"
          />
        </Field>

        <Field label="Confirm new password" name="confirmPassword" required>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            className="input"
          />
        </Field>

        <SubmitButton className="btn-primary w-full" pendingLabel="Saving…">
          Set password and sign in
        </SubmitButton>
      </form>
    </Card>
  );
}
