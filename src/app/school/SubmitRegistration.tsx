'use client';

import { useActionState } from 'react';
import { submitRegistration, type SchoolActionState } from '@/actions/school';
import { SubmitButton } from '@/components/SubmitButton';
import { FormMessage } from '@/components/FormMessage';

export function SubmitRegistration({
  submittedAt,
  disabled,
}: {
  submittedAt: string | null;
  disabled: boolean;
}) {
  const [state, action] = useActionState<SchoolActionState, FormData>(submitRegistration, null);

  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      {submittedAt && !state?.message && (
        <p className="text-xs text-ink-muted">Last submitted {submittedAt}.</p>
      )}
      <fieldset disabled={disabled}>
        <SubmitButton className="btn-dark w-full" pendingLabel="Submitting…">
          {submittedAt ? 'Re-submit squad' : 'Submit squad for review'}
        </SubmitButton>
      </fieldset>
      {disabled && <p className="text-xs text-ink-muted">Registration is closed for this edition.</p>}
    </form>
  );
}
