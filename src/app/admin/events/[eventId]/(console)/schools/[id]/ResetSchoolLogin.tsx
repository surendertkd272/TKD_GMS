'use client';

import { useActionState } from 'react';
import { resetSchoolPassword, type AdminState } from '@/actions/admin';
import { SubmitButton } from '@/components/SubmitButton';
import { FormMessage } from '@/components/FormMessage';
import { Field } from '@/components/ui';
import { EventIdField } from '@/components/EventIdField';
import { MIN_PASSWORD_LENGTH, PASSWORD_HINT } from '@/lib/constants';

export function ResetSchoolLogin({ schoolId, email }: { schoolId: string; email: string | null }) {
  const [state, action] = useActionState<AdminState, FormData>(resetSchoolPassword, null);

  if (!email) {
    return (
      <p className="text-sm text-ink-muted">
        This school has no login on file, so there is nothing to reset.
      </p>
    );
  }

  return (
    // key: remount on success so the typed password does not linger on screen
    <form action={action} className="space-y-4" key={state?.ok ? 'done' : 'editing'}>
      <EventIdField />
      <FormMessage state={state} />
      <input type="hidden" name="schoolId" value={schoolId} />

      <p className="text-sm text-ink-soft">
        Sets a new password for <span className="font-medium text-ink">{email}</span>. Give it to
        the coach directly — it is not emailed to them.
      </p>

      <Field label="New password" name="newPassword" required hint={PASSWORD_HINT}>
        <input
          id="newPassword"
          name="newPassword"
          type="text"
          autoComplete="off"
          minLength={MIN_PASSWORD_LENGTH}
          required
          className="input"
        />
      </Field>

      <SubmitButton
        className="btn-ghost"
        pendingLabel="Updating…"
        confirm="Replace this school's password? Their current one stops working immediately."
      >
        Reset password
      </SubmitButton>
    </form>
  );
}
