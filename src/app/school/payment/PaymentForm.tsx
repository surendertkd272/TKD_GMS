'use client';

import { useActionState } from 'react';
import { recordSchoolPayment, type SchoolActionState } from '@/actions/school';
import { SubmitButton } from '@/components/SubmitButton';
import { FormMessage } from '@/components/FormMessage';
import { Field } from '@/components/ui';
import { PAYMENT_METHODS } from '@/lib/constants';

export function PaymentForm({ suggestedAmount }: { suggestedAmount: number }) {
  const [state, action] = useActionState<SchoolActionState, FormData>(recordSchoolPayment, null);

  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />

      <Field label="Amount paid (₹)" name="amount" required>
        <input
          id="amount"
          name="amount"
          type="number"
          min="1"
          step="1"
          required
          defaultValue={suggestedAmount > 0 ? suggestedAmount : ''}
          className="input"
        />
      </Field>

      <Field label="Method" name="method" required>
        <select id="method" name="method" className="select" defaultValue="ONLINE">
          {PAYMENT_METHODS.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Transaction / UTR reference" name="reference" required hint="Used by the organisers to reconcile the payment.">
        <input id="reference" name="reference" required className="input" placeholder="e.g. UTR123456789" />
      </Field>

      <SubmitButton className="btn-primary w-full" pendingLabel="Recording…">
        Record payment
      </SubmitButton>
    </form>
  );
}
