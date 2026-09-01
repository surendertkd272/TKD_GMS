'use client';

import { useActionState, useState } from 'react';
import { createSchoolAsAdmin, type AdminState } from '@/actions/admin';
import { SubmitButton } from '@/components/SubmitButton';
import { FormMessage } from '@/components/FormMessage';
import { Card, Field } from '@/components/ui';
import { EventIdField } from '@/components/EventIdField';
import { MIN_PASSWORD_LENGTH, PASSWORD_HINT } from '@/lib/constants';

/** Lets the organiser enter a school directly, for walk-ins and phone entries. */
export function NewSchoolForm() {
  const [state, action] = useActionState<AdminState, FormData>(createSchoolAsAdmin, null);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Card bodyClassName="card-pad">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-soft">
            Schools normally sign themselves up from the event page. Enter one here for a walk-in or
            a phone entry.
          </p>
          <button type="button" onClick={() => setOpen(true)} className="btn-primary btn-sm">
            Add a school
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Add a school" subtitle="Approved immediately — you entered it.">
      {/* key: remount on success so the typed password does not linger */}
      <form action={action} className="space-y-4" key={state?.ok ? 'done' : 'editing'}>
        <EventIdField />
        <FormMessage state={state} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="School name" name="schoolName" required>
            <input id="schoolName" name="schoolName" required className="input" placeholder="Greenwood High School" />
          </Field>
          <Field label="City" name="city">
            <input id="city" name="city" className="input" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Coach / teacher-in-charge" name="coachName" required>
            <input id="coachName" name="coachName" required className="input" />
          </Field>
          <Field label="Phone" name="contactPhone">
            <input id="contactPhone" name="contactPhone" className="input" placeholder="+91 …" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact email" name="contactEmail" required hint="This becomes their sign-in.">
            <input id="contactEmail" name="contactEmail" type="email" required className="input" />
          </Field>
          <Field label="Password" name="password" required hint={`${PASSWORD_HINT} Give it to the coach directly.`}>
            <input
              id="password"
              name="password"
              type="text"
              autoComplete="off"
              minLength={MIN_PASSWORD_LENGTH}
              required
              className="input"
            />
          </Field>
        </div>

        <div className="flex items-center gap-2">
          <SubmitButton className="btn-primary" pendingLabel="Adding…">
            Add school
          </SubmitButton>
          <button type="button" onClick={() => setOpen(false)} className="btn-quiet btn-sm">
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
