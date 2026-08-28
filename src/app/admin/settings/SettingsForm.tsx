'use client';

import { useActionState } from 'react';
import { updateSettings, type AdminState } from '@/actions/admin';
import { SubmitButton } from '@/components/SubmitButton';
import { FormMessage } from '@/components/FormMessage';
import { Card, Field } from '@/components/ui';

export type SettingsValues = {
  eventName: string;
  edition: string;
  organiser: string;
  venue: string;
  startDate: string;
  endDate: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
  ageReferenceDate: string;
  feePerParticipant: number;
  pointsGold: number;
  pointsSilver: number;
  pointsBronze: number;
  signatory1Name: string;
  signatory1Title: string;
  signatory2Name: string;
  signatory2Title: string;
  registrationLocked: boolean;
  drawsPublished: boolean;
  resultsPublished: boolean;
};

export function SettingsForm({ values }: { values: SettingsValues }) {
  const [state, action] = useActionState<AdminState, FormData>(updateSettings, null);

  return (
    <form action={action} className="max-w-4xl space-y-6">
      <FormMessage state={state} />

      <Card title="Identity" subtitle="Printed on accreditation cards, certificates and the public page.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Event name" name="eventName" required className="sm:col-span-2">
            <input id="eventName" name="eventName" defaultValue={values.eventName} required className="input" />
          </Field>
          <Field label="Edition" name="edition" required hint="Used in participant IDs and certificate numbers.">
            <input id="edition" name="edition" defaultValue={values.edition} required className="input" />
          </Field>
          <Field label="Organiser" name="organiser" required>
            <input id="organiser" name="organiser" defaultValue={values.organiser} required className="input" />
          </Field>
          <Field label="Venue" name="venue" required className="sm:col-span-2">
            <input id="venue" name="venue" defaultValue={values.venue} required className="input" />
          </Field>
        </div>
      </Card>

      <Card title="Dates">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Event starts" name="startDate" required>
            <input id="startDate" name="startDate" type="datetime-local" defaultValue={values.startDate} required className="input" />
          </Field>
          <Field label="Event ends" name="endDate" required>
            <input id="endDate" name="endDate" type="datetime-local" defaultValue={values.endDate} required className="input" />
          </Field>
          <Field label="Registration opens" name="registrationOpensAt" required>
            <input
              id="registrationOpensAt"
              name="registrationOpensAt"
              type="datetime-local"
              defaultValue={values.registrationOpensAt}
              required
              className="input"
            />
          </Field>
          <Field label="Registration closes" name="registrationClosesAt" required>
            <input
              id="registrationClosesAt"
              name="registrationClosesAt"
              type="datetime-local"
              defaultValue={values.registrationClosesAt}
              required
              className="input"
            />
          </Field>
          <Field
            label="Age reference date"
            name="ageReferenceDate"
            required
            className="sm:col-span-2"
            hint="Every athlete's age category is measured on this date (WT convention: 31 December of the event year). Changing it reclassifies everyone and is reported back to you."
          >
            <input
              id="ageReferenceDate"
              name="ageReferenceDate"
              type="date"
              defaultValue={values.ageReferenceDate}
              required
              className="input"
            />
          </Field>
        </div>
      </Card>

      <Card title="Fees & championship points">
        <div className="grid gap-5 sm:grid-cols-4">
          <Field label="Fee per athlete (₹)" name="feePerParticipant" required>
            <input
              id="feePerParticipant"
              name="feePerParticipant"
              type="number"
              min="0"
              defaultValue={values.feePerParticipant}
              required
              className="input"
            />
          </Field>
          <Field label="Gold points" name="pointsGold" required>
            <input id="pointsGold" name="pointsGold" type="number" min="0" defaultValue={values.pointsGold} required className="input" />
          </Field>
          <Field label="Silver points" name="pointsSilver" required>
            <input id="pointsSilver" name="pointsSilver" type="number" min="0" defaultValue={values.pointsSilver} required className="input" />
          </Field>
          <Field label="Bronze points" name="pointsBronze" required>
            <input id="pointsBronze" name="pointsBronze" type="number" min="0" defaultValue={values.pointsBronze} required className="input" />
          </Field>
        </div>
        <p className="hint mt-3">
          Weighted points decide the “Champion School” award and recalculate live as medals are awarded.
        </p>
      </Card>

      <Card title="Certificate signatures">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Signatory 1 — name" name="signatory1Name" required>
            <input id="signatory1Name" name="signatory1Name" defaultValue={values.signatory1Name} required className="input" />
          </Field>
          <Field label="Signatory 1 — title" name="signatory1Title" required>
            <input id="signatory1Title" name="signatory1Title" defaultValue={values.signatory1Title} required className="input" />
          </Field>
          <Field label="Signatory 2 — name" name="signatory2Name" required>
            <input id="signatory2Name" name="signatory2Name" defaultValue={values.signatory2Name} required className="input" />
          </Field>
          <Field label="Signatory 2 — title" name="signatory2Title" required>
            <input id="signatory2Title" name="signatory2Title" defaultValue={values.signatory2Title} required className="input" />
          </Field>
        </div>
      </Card>

      <Card title="Publication switches" subtitle="What the outside world can see right now.">
        <div className="space-y-3.5">
          {[
            {
              name: 'registrationLocked',
              checked: values.registrationLocked,
              label: 'Registration locked',
              hint: 'Schools can no longer add or edit participants. Set automatically when draws are published.',
            },
            {
              name: 'drawsPublished',
              checked: values.drawsPublished,
              label: 'Draws published',
              hint: 'Shows the “draws are live” state on the public page and school dashboards.',
            },
            {
              name: 'resultsPublished',
              checked: values.resultsPublished,
              label: 'Results published',
              hint: 'Turn off to hide live results and the medal tally from the public page.',
            },
          ].map((toggle) => (
            <label key={toggle.name} className="flex items-start gap-3">
              <input type="checkbox" name={toggle.name} defaultChecked={toggle.checked} className="checkbox mt-0.5" />
              <span>
                <span className="block text-sm font-medium text-ink">{toggle.label}</span>
                <span className="block text-xs leading-relaxed text-ink-muted">{toggle.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </Card>

      <SubmitButton className="btn-primary" pendingLabel="Saving…">
        Save event settings
      </SubmitButton>
    </form>
  );
}
