import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { db, getEventById } from '@/lib/db';
import { Card, Empty, PageHeader, Stat, StatusBadge, TableWrap } from '@/components/ui';
import { fmtDate, money } from '@/lib/format';
import { adminPath } from '@/lib/paths';
import { NewSchoolForm } from './NewSchoolForm';

export const metadata = { title: 'Schools' };
export const dynamic = 'force-dynamic';

export default async function AdminSchoolsPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  await requireAdmin();
  const [{ eventId }, params] = await Promise.all([routeParams, searchParams]);
  const event = await getEventById(eventId);
  if (!event) notFound();

  const schools = await db.school.findMany({
    where: { eventId,
      ...(params.status ? { status: params.status } : {}),
      ...(params.q ? { name: { contains: params.q, mode: 'insensitive' } } : {}),
    },
    include: {
      _count: { select: { participants: true } },
      participants: { where: { personRole: 'ATHLETE' }, select: { id: true } },
    },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
  });

  const counts = await db.school.groupBy({ by: ['status'], where: { eventId }, _count: true });
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count]));

  return (
    <>
      <PageHeader
        title="Schools"
        subtitle="Approving a school releases every accreditation card for its squad."
      />


      <div className="mb-6">
        <NewSchoolForm />
      </div>
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Total" value={schools.length} />
          <Stat label="Pending" value={byStatus.PENDING ?? 0} />
          <Stat label="Approved" value={byStatus.APPROVED ?? 0} />
          <Stat label="Returned" value={byStatus.REJECTED ?? 0} />
        </div>

        <Card bodyClassName="card-pad">
          <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <input name="q" defaultValue={params.q ?? ''} placeholder="Search school name…" className="input" />
            <select name="status" defaultValue={params.status ?? ''} className="select">
              <option value="">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Returned</option>
            </select>
            <button type="submit" className="btn-dark">
              Filter
            </button>
          </form>
        </Card>

        {schools.length === 0 ? (
          <Empty title="No schools match" hint="Clear the filters, or wait for schools to self-register." />
        ) : (
          <Card bodyClassName="">
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>School</th>
                    <th>Board</th>
                    <th>Coach</th>
                    <th>Participants</th>
                    <th>Athletes</th>
                    <th>Fee</th>
                    <th>Submitted</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {schools.map((school) => (
                    <tr key={school.id}>
                      <td className="num text-ink-muted">{school.code}</td>
                      <td className="font-medium text-ink">{school.name}</td>
                      <td className="whitespace-nowrap text-xs">{school.boardAffiliation ?? '—'}</td>
                      <td className="whitespace-nowrap text-xs">{school.coachName ?? '—'}</td>
                      <td className="num">{school._count.participants}</td>
                      <td className="num">{school.participants.length}</td>
                      <td className="whitespace-nowrap">
                        <span className="num">{money(school.amountPaid)}</span>
                        <span className="text-ink-muted"> / {money(school.amountDue)}</span>
                        <span className="ml-2">
                          <StatusBadge status={school.paymentStatus} />
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-xs text-ink-muted">
                        {school.submittedAt ? fmtDate(school.submittedAt) : 'Not yet'}
                      </td>
                      <td>
                        <StatusBadge status={school.status} />
                      </td>
                      <td className="text-right">
                        <Link href={adminPath(eventId, `schools/${school.id}`)} className="btn-ghost btn-sm">
                          Review
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        )}
      </div>
    </>
  );
}
