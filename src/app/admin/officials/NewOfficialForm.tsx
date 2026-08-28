'use client';

import { useActionState } from 'react';
import { createOfficial, type AdminState } from '@/actions/admin';
import { SubmitButton } from '@/components/SubmitButton';
import { FormMessage } from '@/components/FormMessage';
import { Card, Field } from '@/components/ui';

export function NewOfficialForm({ mats }: { mats: { id: string; name: string }[] }) {
  const [state, action] = useActionState<AdminState, FormData>(createOfficial, null);

  return (
    <Card title="Add an official" subtitle="Give them the email and password to sign in mat-side.">
      <form action={action} className="space-y-4">
        <FormMessage state={state} />

        <Field label="Name" name="name" required>
          <input id="name" name="name" required className="input" />
        </Field>

        <Field label="Email (login)" name="email" required>
          <input id="email" name="email" type="email" required className="input" />
        </Field>

        <Field label="Password" name="password" required hint="At least 8 characters. Share it directly with the official.">
          <input id="password" name="password" type="password" required minLength={8} className="input" />
        </Field>

        <Field label="Certification" name="certification">
          <input id="certification" name="certification" className="input" placeholder="WT Level 1 / State Referee" />
        </Field>

        <Field label="Assigned mat" name="assignedMatId" hint="The scoring panel only shows bouts on this mat.">
          <select id="assignedMatId" name="assignedMatId" className="select" defaultValue="">
            <option value="">Not assigned yet</option>
            {mats.map((mat) => (
              <option key={mat.id} value={mat.id}>
                {mat.name}
              </option>
            ))}
          </select>
        </Field>

        <label className="flex items-center gap-2.5 text-sm text-ink-soft">
          <input type="checkbox" name="isJury" className="checkbox" defaultChecked />
          Also a Poomsae jury member
        </label>

        <SubmitButton className="btn-primary w-full" pendingLabel="Creating…">
          Create official account
        </SubmitButton>
      </form>
    </Card>
  );
}
