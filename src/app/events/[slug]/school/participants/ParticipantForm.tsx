'use client';

import { useActionState, useMemo, useState } from 'react';
import Link from 'next/link';
import { createParticipant, updateParticipant, type SchoolActionState } from '@/actions/school';
import { SubmitButton } from '@/components/SubmitButton';
import { FormMessage } from '@/components/FormMessage';
import { Card, Field } from '@/components/ui';
import { AGE_CATEGORY_LABEL, BELT_GRADES, PERSON_ROLES, type AgeCategory } from '@/lib/constants';
import { schoolPath } from '@/lib/paths';

export type ParticipantFormValues = {
  id?: string;
  name: string;
  gender: string;
  dob: string;
  weightKg: string;
  beltGrade: string;
  personRole: string;
  email: string;
  phone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  medicalNotes: string;
  events: string[];
  photoPath: string | null;
  code?: string;
};

const EMPTY: ParticipantFormValues = {
  name: '',
  gender: 'MALE',
  dob: '',
  weightKg: '',
  beltGrade: 'White',
  personRole: 'ATHLETE',
  email: '',
  phone: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  medicalNotes: '',
  events: ['KYORUGI'],
  photoPath: null,
};

/** Mirror of src/lib/age.ts so the coach sees the category before saving. */
function classify(dobValue: string, referenceIso: string): { label: string; tone: string } {
  if (!dobValue) return { label: 'Enter a date of birth', tone: 'text-ink-muted' };

  const dob = new Date(dobValue);
  const ref = new Date(referenceIso);
  if (Number.isNaN(dob.getTime())) return { label: 'Not a valid date', tone: 'text-tkd-red' };

  let age = ref.getFullYear() - dob.getFullYear();
  const monthDiff = ref.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && ref.getDate() < dob.getDate())) age -= 1;

  if (age < 0) return { label: 'Date of birth is in the future', tone: 'text-tkd-red' };

  const category: AgeCategory | null = age <= 11 ? 'YOUTH' : age <= 14 ? 'CADET' : age <= 17 ? 'JUNIOR' : null;
  if (!category) {
    return { label: `Age ${age} — outside the championship categories`, tone: 'text-tkd-red' };
  }
  return { label: `Age ${age} → ${AGE_CATEGORY_LABEL[category]}`, tone: 'text-emerald-700' };
}

export function ParticipantForm({
  mode,
  eventSlug,
  values = EMPTY,
  ageReferenceIso,
  ageReferenceLabel,
  readOnly = false,
}: {
  mode: 'create' | 'edit';
  eventSlug: string;
  values?: ParticipantFormValues;
  ageReferenceIso: string;
  ageReferenceLabel: string;
  readOnly?: boolean;
}) {
  const [state, action] = useActionState<SchoolActionState, FormData>(
    mode === 'create' ? createParticipant : updateParticipant,
    null,
  );

  const [dob, setDob] = useState(values.dob);
  const [personRole, setPersonRole] = useState(values.personRole);
  const [events, setEvents] = useState<string[]>(values.events);

  const ageInfo = useMemo(() => classify(dob, ageReferenceIso), [dob, ageReferenceIso]);
  const isAthlete = personRole === 'ATHLETE';

  const toggleEvent = (event: string) =>
    setEvents((prev) => (prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]));

  return (
    <form action={action} className="space-y-6">
      {values.id && <input type="hidden" name="participantId" value={values.id} />}

      <FormMessage state={state} />

      <fieldset disabled={readOnly} className="space-y-6">
        <Card title="Participant" subtitle="Age category is calculated automatically — it is never typed in.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Full name" name="name" required className="sm:col-span-2">
              <input id="name" name="name" defaultValue={values.name} required className="input" />
            </Field>

            <Field label="Role" name="personRole" required>
              <select
                id="personRole"
                name="personRole"
                value={personRole}
                onChange={(e) => setPersonRole(e.target.value)}
                className="select"
              >
                {PERSON_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role.charAt(0) + role.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Gender" name="gender" required>
              <select id="gender" name="gender" defaultValue={values.gender} className="select">
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
              </select>
            </Field>

            <Field
              label="Date of birth"
              name="dob"
              required
              hint={`Age is measured on ${ageReferenceLabel}, the event's reference date.`}
            >
              <input
                id="dob"
                name="dob"
                type="date"
                required
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="input"
              />
            </Field>

            <div>
              <span className="label">Age category (auto)</span>
              <div className="flex h-[38px] items-center rounded-md border border-dashed border-surface-line bg-surface-sunk/60 px-3">
                <span className={`text-sm font-medium ${ageInfo.tone}`}>{ageInfo.label}</span>
              </div>
            </div>

            <Field label="Weight (kg)" name="weightKg" required hint="Estimate is fine — confirmed at weigh-in.">
              <input
                id="weightKg"
                name="weightKg"
                type="number"
                step="0.1"
                min="10"
                max="200"
                required
                defaultValue={values.weightKg}
                className="input"
              />
            </Field>

            <Field label="Belt grade" name="beltGrade" required>
              <select id="beltGrade" name="beltGrade" defaultValue={values.beltGrade} className="select">
                {BELT_GRADES.map((belt) => (
                  <option key={belt} value={belt}>
                    {belt}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        {isAthlete && (
          <Card
            title="Events entered"
            subtitle="The weight division is matched from the weight and age category above."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { value: 'KYORUGI', label: 'Kyorugi (Sparring)', hint: 'Single-elimination bracket by weight division' },
                { value: 'POOMSAE', label: 'Poomsae (Forms)', hint: 'Ranked, multi-judge scoring' },
              ].map((event) => (
                <label
                  key={event.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors ${
                    events.includes(event.value)
                      ? 'border-tkd-red/40 bg-tkd-red/[0.04]'
                      : 'border-surface-line hover:bg-surface-sunk/60'
                  }`}
                >
                  <input
                    type="checkbox"
                    name="events"
                    value={event.value}
                    checked={events.includes(event.value)}
                    onChange={() => toggleEvent(event.value)}
                    className="checkbox mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-medium text-ink">{event.label}</span>
                    <span className="mt-0.5 block text-xs text-ink-muted">{event.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </Card>
        )}

        <Card title="Photo, contact & medical" subtitle="The photo prints on the accreditation card.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Photo (JPG or PNG)"
              name="photo"
              className="sm:col-span-2"
              hint={
                values.photoPath
                  ? 'A photo is already on file — uploading replaces it.'
                  : 'Portrait orientation works best. Max 3 MB.'
              }
            >
              <div className="flex items-center gap-4">
                {values.photoPath && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={values.photoPath}
                    alt=""
                    className="h-16 w-[52px] rounded border border-surface-line object-cover"
                  />
                )}
                <input
                  id="photo"
                  name="photo"
                  type="file"
                  accept="image/jpeg,image/png"
                  className="input file:mr-3 file:rounded file:border-0 file:bg-surface-sunk file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-ink-soft"
                />
              </div>
            </Field>

            <Field label="Participant email" name="email" hint="Optional — enables individual certificate dispatch.">
              <input id="email" name="email" type="email" defaultValue={values.email} className="input" />
            </Field>

            <Field label="Participant phone" name="phone">
              <input id="phone" name="phone" defaultValue={values.phone} className="input" />
            </Field>

            <Field label="Emergency contact name" name="emergencyContactName">
              <input
                id="emergencyContactName"
                name="emergencyContactName"
                defaultValue={values.emergencyContactName}
                className="input"
              />
            </Field>

            <Field label="Emergency contact phone" name="emergencyContactPhone">
              <input
                id="emergencyContactPhone"
                name="emergencyContactPhone"
                defaultValue={values.emergencyContactPhone}
                className="input"
              />
            </Field>

            <Field
              label="Medical notes"
              name="medicalNotes"
              className="sm:col-span-2"
              hint="Visible to the organising team and mat officials only."
            >
              <textarea
                id="medicalNotes"
                name="medicalNotes"
                defaultValue={values.medicalNotes}
                className="textarea"
                placeholder="Asthma, allergies, previous injury…"
              />
            </Field>
          </div>
        </Card>

        {mode === 'create' && (
          <label className="flex items-center gap-2.5 text-sm text-ink-soft">
            <input type="checkbox" name="allowDuplicate" className="checkbox" />
            This is a different person, even if the name and date of birth match an existing entry
          </label>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton className="btn-primary" pendingLabel="Saving…">
            {mode === 'create' ? 'Add participant' : 'Save changes'}
          </SubmitButton>
          <Link href={schoolPath(eventSlug, 'participants')} className="btn-ghost">
            Cancel
          </Link>
          {values.code && (
            <span className="ml-auto text-xs text-ink-muted">
              Participant ID <span className="num text-ink-soft">{values.code}</span>
            </span>
          )}
        </div>
      </fieldset>
    </form>
  );
}
