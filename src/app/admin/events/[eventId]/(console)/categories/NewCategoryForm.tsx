'use client';

import { useActionState, useState } from 'react';
import { createCategory, type AdminState } from '@/actions/admin';
import { SubmitButton } from '@/components/SubmitButton';
import { FormMessage } from '@/components/FormMessage';
import { Card, Field } from '@/components/ui';
import { POOMSAE_TYPES } from '@/lib/constants';
import { EventIdField } from '@/components/EventIdField';

export function NewCategoryForm() {
  const [state, action] = useActionState<AdminState, FormData>(createCategory, null);
  const [event, setEvent] = useState('KYORUGI');

  return (
    <Card title="Add a division" subtitle="Use this when an athlete's weight falls outside the seeded grid.">
      <form action={action} className="space-y-4">
        <EventIdField />
        <FormMessage state={state} />

        <Field label="Display name" name="name" required>
          <input id="name" name="name" required className="input" placeholder="Cadet Male -69 kg" />
        </Field>

        <Field label="Discipline" name="event" required>
          <select id="event" name="event" value={event} onChange={(e) => setEvent(e.target.value)} className="select">
            <option value="KYORUGI">Kyorugi</option>
            <option value="POOMSAE">Poomsae</option>
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Age category" name="ageCategory" required>
            <select id="ageCategory" name="ageCategory" className="select" defaultValue="CADET">
              <option value="YOUTH">Youth</option>
              <option value="CADET">Cadet</option>
              <option value="JUNIOR">Junior</option>
            </select>
          </Field>
          <Field label="Gender" name="gender" required>
            <select id="gender" name="gender" className="select" defaultValue="MALE">
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="MIXED">Mixed</option>
            </select>
          </Field>
        </div>

        {event === 'KYORUGI' ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Above (kg)" name="weightMin" hint="Leave blank for the lightest division.">
                <input id="weightMin" name="weightMin" type="number" step="0.5" className="input" />
              </Field>
              <Field label="Up to (kg)" name="weightMax" hint="Leave blank for the open division.">
                <input id="weightMax" name="weightMax" type="number" step="0.5" className="input" />
              </Field>
            </div>
            <Field label="Weight label" name="weightLabel" hint="Defaults to “-45 kg” / “+65 kg”.">
              <input id="weightLabel" name="weightLabel" className="input" placeholder="-69 kg" />
            </Field>
          </>
        ) : (
          <Field label="Poomsae type" name="poomsaeType" required>
            <select id="poomsaeType" name="poomsaeType" className="select" defaultValue="RECOGNISED">
              {POOMSAE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.charAt(0) + type.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </Field>
        )}

        <SubmitButton className="btn-primary w-full" pendingLabel="Creating…">
          Add division
        </SubmitButton>
      </form>
    </Card>
  );
}
