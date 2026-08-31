'use client';

import { useActionState } from 'react';
import { createEventAction, type EventState } from '@/actions/events';
import { SubmitButton } from '@/components/SubmitButton';
import { FormMessage } from '@/components/FormMessage';
import { Card, Field } from '@/components/ui';

export function NewEventForm({ defaultEdition }: { defaultEdition: string }) {
  const [state, action] = useActionState<EventState, FormData>(createEventAction, null);

  return (
    <Card>
      <form action={action} className="space-y-5">
        <FormMessage state={state} />

        <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
          <Field label="Event name" name="eventName" required>
            <input
              id="eventName"
              name="eventName"
              required
              className="input"
              placeholder="Spring Open Taekwondo Championship"
            />
          </Field>
          <Field label="Edition" name="edition" required hint="Usually the year.">
            <input id="edition" name="edition" required className="input" defaultValue={defaultEdition} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Organiser" name="organiser" required>
            <input id="organiser" name="organiser" required className="input" placeholder="Host school or association" />
          </Field>
          <Field label="Venue" name="venue" required>
            <input id="venue" name="venue" required className="input" placeholder="Sports complex" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Event starts" name="startDate" required>
            <input id="startDate" name="startDate" type="date" required className="input" />
          </Field>
          <Field label="Event ends" name="endDate" required>
            <input id="endDate" name="endDate" type="date" required className="input" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Registration opens" name="registrationOpensAt" required>
            <input id="registrationOpensAt" name="registrationOpensAt" type="date" required className="input" />
          </Field>
          <Field label="Registration closes" name="registrationClosesAt" required>
            <input id="registrationClosesAt" name="registrationClosesAt" type="date" required className="input" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Age reference date"
            name="ageReferenceDate"
            required
            hint="WT convention is 31 December of the event year — every athlete's age category is computed against this date."
          >
            <input id="ageReferenceDate" name="ageReferenceDate" type="date" required className="input" />
          </Field>
          <Field label="Entry fee per participant (₹)" name="feePerParticipant" required>
            <input
              id="feePerParticipant"
              name="feePerParticipant"
              type="number"
              min="0"
              required
              className="input"
              defaultValue={500}
            />
          </Field>
        </div>

        <SubmitButton className="btn-primary" pendingLabel="Creating…">
          Create event
        </SubmitButton>
      </form>
    </Card>
  );
}
