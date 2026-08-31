'use client';

import { useActionState } from 'react';
import { registerSchoolAction, type AuthState } from '@/actions/auth';
import { SubmitButton } from '@/components/SubmitButton';
import { Field, Notice } from '@/components/ui';

export function RegisterSchoolForm({ eventId, disabled }: { eventId: string; disabled: boolean }) {
  const [state, action] = useActionState<AuthState, FormData>(registerSchoolAction, null);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="eventId" value={eventId} />
      {state?.error && <Notice kind="error">{state.error}</Notice>}

      <fieldset disabled={disabled} className="space-y-5 disabled:opacity-60">
        <div className="space-y-4">
          <p className="eyebrow">Institution</p>

          <Field label="School name" name="schoolName" required>
            <input id="schoolName" name="schoolName" required className="input" placeholder="Greenwood High School" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Board affiliation" name="boardAffiliation">
              <select id="boardAffiliation" name="boardAffiliation" className="select" defaultValue="">
                <option value="">Select…</option>
                {['CBSE', 'ICSE / CISCE', 'State Board', 'IB', 'IGCSE', 'Other'].map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Principal" name="principalName">
              <input id="principalName" name="principalName" className="input" />
            </Field>
          </div>

          <Field label="Address" name="address">
            <input id="address" name="address" className="input" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="City" name="city">
              <input id="city" name="city" className="input" />
            </Field>
            <Field label="State" name="state">
              <input id="state" name="state" className="input" />
            </Field>
          </div>
        </div>

        <div className="space-y-4 border-t border-surface-line pt-5">
          <p className="eyebrow">Coach / teacher-in-charge</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" name="coachName" required>
              <input id="coachName" name="coachName" required className="input" />
            </Field>
            <Field label="Mobile" name="coachPhone">
              <input id="coachPhone" name="coachPhone" className="input" placeholder="+91 …" />
            </Field>
          </div>
        </div>

        <div className="space-y-4 border-t border-surface-line pt-5">
          <p className="eyebrow">Login</p>

          <Field
            label="Contact email"
            name="contactEmail"
            required
            hint="This becomes your username, and receives receipts and certificates."
          >
            <input id="contactEmail" name="contactEmail" type="email" required className="input" />
          </Field>

          <Field label="School phone" name="contactPhone">
            <input id="contactPhone" name="contactPhone" className="input" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Password" name="password" required hint="At least 8 characters.">
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="input"
              />
            </Field>
            <Field label="Confirm password" name="confirmPassword" required>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="input"
              />
            </Field>
          </div>
        </div>

        <SubmitButton className="btn-primary w-full" pendingLabel="Creating account…">
          Create school account
        </SubmitButton>
      </fieldset>
    </form>
  );
}
