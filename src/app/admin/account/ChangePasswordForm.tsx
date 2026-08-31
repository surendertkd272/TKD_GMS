'use client';

import { useActionState } from 'react';
import { changePasswordAction, type AccountState } from '@/actions/account';
import { SubmitButton } from '@/components/SubmitButton';
import { FormMessage } from '@/components/FormMessage';
import { Card, Field } from '@/components/ui';
import { MIN_PASSWORD_LENGTH, PASSWORD_HINT } from '@/lib/constants';

export function ChangePasswordForm() {
  const [state, action] = useActionState<AccountState, FormData>(changePasswordAction, null);

  return (
    <Card>
      {/* key: remount on success so the browser clears the filled-in fields */}
      <form action={action} className="space-y-5" key={state?.ok ? 'done' : 'editing'}>
        <FormMessage state={state} />

        <Field label="Current password" name="currentPassword" required>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            className="input"
          />
        </Field>

        <Field
          label="New password"
          name="newPassword"
          required
          hint={`${PASSWORD_HINT} Use something not shared with any other system.`}
        >
          <input
            id="newPassword"
            name="newPassword"
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

        <SubmitButton className="btn-primary" pendingLabel="Updating…">
          Update password
        </SubmitButton>
      </form>
    </Card>
  );
}
