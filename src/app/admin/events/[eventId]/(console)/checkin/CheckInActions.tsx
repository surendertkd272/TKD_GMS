'use client';

import { useActionState } from 'react';
import { checkInParticipant, recordWeighIn, type AdminState } from '@/actions/admin';
import { SubmitButton } from '@/components/SubmitButton';
import { FormMessage } from '@/components/FormMessage';
import { Field } from '@/components/ui';
import { EventIdField } from '@/components/EventIdField';

export function CheckInActions({
  code,
  alreadyCheckedIn,
  declaredWeight,
  phone,
}: {
  code: string;
  alreadyCheckedIn: boolean;
  declaredWeight: number;
  phone: string | null;
}) {
  const [checkInState, checkInAction] = useActionState<AdminState, FormData>(checkInParticipant, null);
  const [weighInState, weighInAction] = useActionState<AdminState, FormData>(recordWeighIn, null);

  return (
    <div className="space-y-4">
      <FormMessage state={checkInState} />
      <FormMessage state={weighInState} />

      <div className="flex flex-wrap items-center gap-3">
        <form action={checkInAction}>
          <EventIdField />
          <input type="hidden" name="code" value={code} />
          <SubmitButton className="btn-primary" pendingLabel="Checking in…">
            {alreadyCheckedIn ? 'Check in again' : 'Check in'}
          </SubmitButton>
        </form>
        <span className="text-xs text-ink-muted">
          {phone ? `Texts a confirmation to ${phone}.` : 'No phone on file — no confirmation text will be sent.'}
        </span>
      </div>

      <form action={weighInAction} className="flex flex-wrap items-end gap-3">
        <EventIdField />
        <input type="hidden" name="code" value={code} />
        <Field label="Weigh-in (kg)" name="weight" hint={`Declared: ${declaredWeight} kg`}>
          <input
            id="weight"
            name="weight"
            type="number"
            step="0.1"
            min="0"
            required
            className="input w-32"
            placeholder={String(declaredWeight)}
          />
        </Field>
        <SubmitButton className="btn-ghost" pendingLabel="Recording…">
          Record weigh-in
        </SubmitButton>
      </form>
    </div>
  );
}
