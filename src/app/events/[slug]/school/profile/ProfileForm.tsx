'use client';

import { useActionState } from 'react';
import { saveSchoolProfile, type SchoolActionState } from '@/actions/school';
import { SubmitButton } from '@/components/SubmitButton';
import { FormMessage } from '@/components/FormMessage';
import { Card, Field } from '@/components/ui';

export function ProfileForm({
  values,
}: {
  values: Record<'name' | 'boardAffiliation' | 'address' | 'city' | 'state' | 'principalName' | 'coachName' | 'coachPhone' | 'contactEmail' | 'contactPhone' | 'code', string>;
}) {
  const [state, action] = useActionState<SchoolActionState, FormData>(saveSchoolProfile, null);

  return (
    <form action={action} className="max-w-3xl space-y-6">
      <FormMessage state={state} />

      <Card title="School" subtitle={`School code ${values.code} — printed on every accreditation card.`}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="School name" name="name" required className="sm:col-span-2">
            <input id="name" name="name" defaultValue={values.name} required className="input" />
          </Field>

          <Field label="Board affiliation" name="boardAffiliation">
            <select id="boardAffiliation" name="boardAffiliation" defaultValue={values.boardAffiliation} className="select">
              <option value="">Select…</option>
              {['CBSE', 'ICSE / CISCE', 'State Board', 'IB', 'IGCSE', 'Other'].map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Principal" name="principalName">
            <input id="principalName" name="principalName" defaultValue={values.principalName} className="input" />
          </Field>

          <Field label="Address" name="address" className="sm:col-span-2">
            <input id="address" name="address" defaultValue={values.address} className="input" />
          </Field>

          <Field label="City" name="city">
            <input id="city" name="city" defaultValue={values.city} className="input" />
          </Field>

          <Field label="State" name="state">
            <input id="state" name="state" defaultValue={values.state} className="input" />
          </Field>
        </div>
      </Card>

      <Card title="Contacts" subtitle="Receipts, approval notices and certificate emails go to the contact email.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Coach / teacher-in-charge" name="coachName" required>
            <input id="coachName" name="coachName" defaultValue={values.coachName} required className="input" />
          </Field>

          <Field label="Coach mobile" name="coachPhone">
            <input id="coachPhone" name="coachPhone" defaultValue={values.coachPhone} className="input" />
          </Field>

          <Field label="Contact email" name="contactEmail" required>
            <input id="contactEmail" name="contactEmail" type="email" defaultValue={values.contactEmail} required className="input" />
          </Field>

          <Field label="School phone" name="contactPhone">
            <input id="contactPhone" name="contactPhone" defaultValue={values.contactPhone} className="input" />
          </Field>
        </div>
      </Card>

      <SubmitButton className="btn-primary" pendingLabel="Saving…">
        Save institution details
      </SubmitButton>
    </form>
  );
}
