import { requireSchool } from '@/lib/auth';
import { db } from '@/lib/db';
import { Card, KeyValue, Notice, PageHeader, Stat, StatusBadge, TableWrap } from '@/components/ui';
import { fmtDateTime, money } from '@/lib/format';
import { PaymentForm } from './PaymentForm';

export const metadata = { title: 'Entry fee' };
export const dynamic = 'force-dynamic';

export default async function SchoolPaymentPage() {
  const { school, event } = await requireSchool();

  const [payments, athletes] = await Promise.all([
    db.payment.findMany({ where: { schoolId: school.id }, orderBy: { paidAt: 'desc' } }),
    db.participant.count({ where: { schoolId: school.id, personRole: 'ATHLETE', status: { not: 'REJECTED' } } }),
  ]);

  const outstanding = Math.max(0, school.amountDue - school.amountPaid);

  return (
    <>
      <PageHeader
        title="Entry fee"
        subtitle={`₹${event.feePerParticipant} per athlete. Coaches, officials and volunteers are accredited free of charge.`}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Athletes entered" value={athletes} hint={`× ${money(event.feePerParticipant)}`} />
            <Stat label="Total due" value={money(school.amountDue)} />
            <Stat
              label="Outstanding"
              value={money(outstanding)}
              hint={<StatusBadge status={school.paymentStatus} />}
            />
          </div>

          {school.paymentStatus === 'PAID' && (
            <Notice kind="ok">
              Entry fee settled in full. A confirmation receipt has been logged against your school.
            </Notice>
          )}
          {school.paymentStatus === 'WAIVED' && (
            <Notice kind="info">The organising team has waived the entry fee for your school.</Notice>
          )}
          {outstanding > 0 && school.paymentStatus !== 'WAIVED' && (
            <Notice kind="warn">
              {money(outstanding)} outstanding. The amount recalculates automatically as you add or
              remove athletes, so pay once your squad is final.
            </Notice>
          )}

          <Card title="Payment history" bodyClassName="">
            {payments.length === 0 ? (
              <div className="card-pad text-sm text-ink-muted">No payments recorded yet.</div>
            ) : (
              <TableWrap>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Method</th>
                      <th>Reference</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id}>
                        <td className="whitespace-nowrap">{fmtDateTime(payment.paidAt)}</td>
                        <td className="num font-semibold text-ink">{money(payment.amount)}</td>
                        <td>{payment.method}</td>
                        <td className="num text-xs">{payment.reference ?? '—'}</td>
                        <td className="text-xs">{payment.note ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Record a payment" subtitle="Enter the transaction reference after paying.">
            <PaymentForm suggestedAmount={outstanding} />
          </Card>

          <Card title="Where to pay" bodyClassName="card-pad">
            <KeyValue
              rows={[
                ['Payable to', event.organiser],
                ['Event', `${event.eventName} ${event.edition}`],
                ['Per athlete', money(event.feePerParticipant)],
                ['Contact', school.contactEmail],
              ]}
            />
            <p className="mt-4 text-xs leading-relaxed text-ink-muted">
              Bank and UPI details are issued by the organising team with your approval notice. Once a
              payment gateway is connected, this panel becomes a checkout button and references are
              filled in automatically.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
