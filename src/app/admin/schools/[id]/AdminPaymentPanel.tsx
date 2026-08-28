'use client';

import { useActionState } from 'react';
import { adminRecordPayment, type AdminState } from '@/actions/admin';
import { SubmitButton } from '@/components/SubmitButton';
import { FormMessage } from '@/components/FormMessage';
import { Field } from '@/components/ui';
import { PAYMENT_METHODS } from '@/lib/constants';
import { money } from '@/lib/format';

export function AdminPaymentPanel({
  schoolId,
  outstanding,
  paymentStatus,
}: {
  schoolId: string;
  outstanding: number;
  paymentStatus: string;
}) {
  const [state, action] = useActionState<AdminState, FormData>(adminRecordPayment, null);

  return (
    <div className="space-y-4">
      <FormMessage state={state} />

      <p className="text-sm text-ink-soft">
        {paymentStatus === 'WAIVED'
          ? 'The entry fee is waived for this school.'
          : outstanding > 0
            ? `${money(outstanding)} outstanding.`
            : 'Settled in full.'}
      </p>

      {paymentStatus !== 'WAIVED' && (
        <form action={action} className="space-y-3">
          <input type="hidden" name="schoolId" value={schoolId} />
          <input type="hidden" name="paymentAction" value="RECORD" />

          <Field label="Amount received (₹)" name="amount" required>
            <input
              id="amount"
              name="amount"
              type="number"
              min="1"
              required
              defaultValue={outstanding > 0 ? outstanding : ''}
              className="input"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Method" name="method">
              <select id="method" name="method" className="select" defaultValue="CASH">
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Reference" name="reference">
              <input id="reference" name="reference" className="input" />
            </Field>
          </div>

          <SubmitButton className="btn-dark w-full" pendingLabel="Recording…">
            Record payment
          </SubmitButton>
        </form>
      )}

      {paymentStatus !== 'WAIVED' && (
        <form action={action} className="border-t border-surface-line pt-3">
          <input type="hidden" name="schoolId" value={schoolId} />
          <input type="hidden" name="paymentAction" value="WAIVE" />
          <SubmitButton className="btn-quiet w-full" pendingLabel="Waiving…" confirm="Waive the entry fee for this school?">
            Waive the entry fee
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
