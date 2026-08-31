import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { groupReadinessIssues, schoolReadiness } from '@/lib/school-service';
import { Card, KeyValue, Notice, PageHeader, Stat, StatusBadge, TableWrap } from '@/components/ui';
import { fmtDate, fmtDateTime, money } from '@/lib/format';
import { AGE_CATEGORY_SHORT, type AgeCategory } from '@/lib/constants';
import { ReviewSchoolPanel } from './ReviewSchoolPanel';
import { AdminPaymentPanel } from './AdminPaymentPanel';
import { ResetSchoolLogin } from './ResetSchoolLogin';
import { adminPath } from '@/lib/paths';

export const dynamic = 'force-dynamic';

export default async function AdminSchoolDetail({
  params,
}: {
  params: Promise<{ eventId: string; id: string }>;
}) {
  await requireAdmin();
  const { eventId, id } = await params;

  const school = await db.school.findFirst({
    where: { id, eventId },
    include: {
      user: { select: { email: true, active: true } },
      participants: { include: { entries: { include: { category: true } } }, orderBy: [{ personRole: 'asc' }, { name: 'asc' }] },
      payments: { orderBy: { paidAt: 'desc' } },
    },
  });
  if (!school) notFound();

  const readiness = await schoolReadiness(school.id);
  const athletes = school.participants.filter((p) => p.personRole === 'ATHLETE');

  return (
    <>
      <PageHeader
        title={school.name}
        subtitle={
          <>
            <span className="num">{school.code}</span> · <StatusBadge status={school.status} /> · fee{' '}
            <StatusBadge status={school.paymentStatus} />
          </>
        }
        actions={
          <>
            {school.status === 'APPROVED' && (
              <Link href={`/api/accreditation/school/batch?schoolId=${school.id}`} className="btn-ghost" target="_blank">
                Batch cards
              </Link>
            )}
            <Link href={adminPath(eventId, 'schools')} className="btn-quiet">
              All schools
            </Link>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Participants" value={school.participants.length} />
            <Stat label="Athletes" value={athletes.length} />
            <Stat label="Entries" value={readiness.counts.entries} />
            <Stat label="Photos" value={`${readiness.counts.withPhoto}/${school.participants.length}`} />
          </div>

          {school.status === 'REJECTED' && school.rejectionReason && (
            <Notice kind="error">
              <strong>Returned to the school:</strong> {school.rejectionReason}
            </Notice>
          )}

          {readiness.issues.length > 0 && (
            <Card
              title="Entry quality"
              subtitle="What the school still needs to fix — worth checking before approving."
              actions={
                <span className="badge-amber">
                  {groupReadinessIssues(readiness.issues).length} flags
                </span>
              }
              bodyClassName=""
            >
              {/* Grouped the same way the school sees it, so both sides discuss
                  the same list. */}
              <ul className="divide-y divide-surface-line">
                {groupReadinessIssues(readiness.issues).map((group) => (
                  <li key={group.kind} className="card-pad">
                    <p className="text-sm font-semibold text-ink">{group.title}</p>
                    <p className="mt-0.5 text-sm text-ink-muted">{group.detail}</p>
                    <p className="mt-2 text-xs text-ink-soft">
                      {group.people.map((p) => p.label).join(' · ')}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title={`Squad (${school.participants.length})`} bodyClassName="">
            {school.participants.length === 0 ? (
              <div className="card-pad text-sm text-ink-muted">No participants entered yet.</div>
            ) : (
              <TableWrap>
                <table className="table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Category</th>
                      <th>Weight</th>
                      <th>Belt</th>
                      <th>Divisions</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {school.participants.map((p) => (
                      <tr key={p.id}>
                        <td className="num text-ink-muted">{p.code}</td>
                        <td className="whitespace-nowrap font-medium text-ink">{p.name}</td>
                        <td className="text-xs uppercase tracking-wide text-ink-muted">{p.personRole.toLowerCase()}</td>
                        <td className="whitespace-nowrap">
                          {AGE_CATEGORY_SHORT[p.ageCategory as AgeCategory] ?? p.ageCategory} ·{' '}
                          {p.gender === 'MALE' ? 'M' : 'F'} <span className="text-xs text-ink-muted">({p.ageAtRef}y)</span>
                        </td>
                        <td className="num">{p.weightKg}</td>
                        <td className="whitespace-nowrap text-xs">{p.beltGrade}</td>
                        <td className="text-xs">
                          {p.entries.length === 0 ? (
                            p.personRole === 'ATHLETE' ? (
                              <span className="badge-amber">Unmatched</span>
                            ) : (
                              '—'
                            )
                          ) : (
                            p.entries.map((e) => e.category.name).join(', ')
                          )}
                        </td>
                        <td>
                          <StatusBadge status={p.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Card>

          {school.payments.length > 0 && (
            <Card title="Payments" bodyClassName="">
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
                    {school.payments.map((payment) => (
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
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Approval">
            <ReviewSchoolPanel
              schoolId={school.id}
              status={school.status}
              participantCount={school.participants.length}
            />
          </Card>

          <Card title="Entry fee">
            <AdminPaymentPanel
              schoolId={school.id}
              outstanding={Math.max(0, school.amountDue - school.amountPaid)}
              paymentStatus={school.paymentStatus}
            />
          </Card>

          <Card title="School login">
            <ResetSchoolLogin schoolId={school.id} email={school.user?.email ?? null} />
          </Card>

          <Card title="On file" bodyClassName="card-pad">
            <KeyValue
              rows={[
                ['Login', school.user?.email ?? 'No login'],
                ['Board', school.boardAffiliation ?? '—'],
                ['Principal', school.principalName ?? '—'],
                ['Coach', `${school.coachName ?? '—'}${school.coachPhone ? ` · ${school.coachPhone}` : ''}`],
                ['Contact', `${school.contactEmail}${school.contactPhone ? ` · ${school.contactPhone}` : ''}`],
                ['Address', [school.address, school.city, school.state].filter(Boolean).join(', ') || '—'],
                ['Registered', fmtDate(school.createdAt)],
                ['Submitted', school.submittedAt ? fmtDateTime(school.submittedAt) : 'Not submitted'],
                ['Approved', school.approvedAt ? fmtDateTime(school.approvedAt) : '—'],
              ]}
            />
          </Card>
        </div>
      </div>
    </>
  );
}
