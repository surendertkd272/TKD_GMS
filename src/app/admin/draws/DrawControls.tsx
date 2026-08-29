'use client';

import { useActionState } from 'react';
import { generateAllDraws, publishAllDraws, type AdminState } from '@/actions/admin';
import { SubmitButton } from '@/components/SubmitButton';
import { FormMessage } from '@/components/FormMessage';
import { Card, Field } from '@/components/ui';

export function DrawControls({ generatedCount }: { generatedCount: number }) {
  const [genState, genAction] = useActionState<AdminState, FormData>(generateAllDraws, null);
  const [pubState, pubAction] = useActionState<AdminState, FormData>(publishAllDraws, null);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card
        title={
          <span className="flex items-center gap-2">
            <span className="step-badge">1</span> Generate every draw
          </span>
        }
        subtitle="Runs across all active categories that have entries."
      >
        <form action={genAction} className="space-y-4">
          <FormMessage state={genState} />

          <Field
            label="Seeding"
            name="strategy"
            hint="Belt grade seeds stronger athletes apart. Both strategies avoid same-school first-round meetings where possible, and give byes to the top seeds."
          >
            <select id="strategy" name="strategy" className="select" defaultValue="BELT">
              <option value="BELT">By belt grade (recommended)</option>
              <option value="RANDOM">Fully random</option>
            </select>
          </Field>

          <SubmitButton
            className="btn-dark"
            pendingLabel="Generating…"
            confirm="Generate draws for every category with entries? Existing unpublished brackets will be replaced."
          >
            Generate all draws
          </SubmitButton>
        </form>
      </Card>

      <Card
        className={generatedCount === 0 ? 'opacity-60' : ''}
        title={
          <span className="flex items-center gap-2">
            <span className="step-badge">2</span> Publish draws
          </span>
        }
        subtitle="Makes brackets visible to schools and the public page, and closes registration."
      >
        <form action={pubAction} className="space-y-4">
          <FormMessage state={pubState} />

          <p className="text-sm leading-relaxed text-ink-soft">
            {generatedCount === 0
              ? 'Nothing is waiting to be published — generate draws first.'
              : `${generatedCount} generated draw${generatedCount === 1 ? '' : 's'} will go live. Registration locks at the same moment so the brackets cannot drift.`}
          </p>

          <SubmitButton
            className="btn-primary"
            pendingLabel="Publishing…"
            disabled={generatedCount === 0}
            confirm="Publish all generated draws and lock registration?"
          >
            Publish &amp; lock registration
          </SubmitButton>
        </form>
      </Card>
    </div>
  );
}
