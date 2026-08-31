import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { db, getEventById } from '@/lib/db';
import { Card, Empty, Notice, PageHeader, Stat, StatusBadge, TableWrap } from '@/components/ui';
import { adminPath } from '@/lib/paths';

export const metadata = { title: 'Accreditation' };
export const dynamic = 'force-dynamic';

export default async function AdminAccreditationPage({ params }: { params: Promise<{ eventId: string }> }) {
  await requireAdmin();
  const { eventId } = await params;
  const event = await getEventById(eventId);
  if (!event) notFound();

  const schools = await db.school.findMany({ where: { eventId },
    include: {
      participants: { select: { id: true, photoPath: true, status: true, personRole: true } },
    },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
  });

  const totals = schools.reduce(
    (acc, school) => {
      const accredited = school.status === 'APPROVED' ? school.participants.length : 0;
      return {
        participants: acc.participants + school.participants.length,
        accredited: acc.accredited + accredited,
        photos: acc.photos + school.participants.filter((p) => p.photoPath).length,
      };
    },
    { participants: 0, accredited: 0, photos: 0 },
  );

  const approvedSchools = schools.filter((s) => s.status === 'APPROVED' && s.participants.length > 0);

  return (
    <>
      <PageHeader
        title="Accreditation"
        subtitle="Cards are generated on approval and reissued automatically whenever a participant's details change."
        actions={
          totals.accredited > 0 ? (
            <>
              <Link href="/api/accreditation/all/batch" className="btn-ghost" target="_blank">
                All batch sheets (A4)
              </Link>
              <Link href="/api/accreditation/all/individual" className="btn-primary" target="_blank">
                All cards (ID size)
              </Link>
            </>
          ) : null
        }
      />

      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Participants" value={totals.participants} />
          <Stat label="Accredited (cards live)" value={totals.accredited} />
          <Stat label="Photos on file" value={`${totals.photos}/${totals.participants}`} />
        </div>

        {totals.photos < totals.participants && (
          <Notice kind="warn">
            {totals.participants - totals.photos} participant
            {totals.participants - totals.photos === 1 ? '' : 's'} have no photo. Their cards print with an
            empty photo box — chase the schools before printing day.
          </Notice>
        )}

        {approvedSchools.length === 0 ? (
          <Empty
            title="No approved schools yet"
            hint="Approving a school releases its accreditation cards instantly."
            action={
              <Link href={adminPath(eventId, 'schools?status=PENDING')} className="btn-primary btn-sm">
                Review registrations
              </Link>
            }
          />
        ) : (
          <Card title="By school" bodyClassName="">
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>School</th>
                    <th>Status</th>
                    <th>Participants</th>
                    <th>Athletes</th>
                    <th>Photos</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {schools.map((school) => {
                    const photos = school.participants.filter((p) => p.photoPath).length;
                    const athletes = school.participants.filter((p) => p.personRole === 'ATHLETE').length;
                    return (
                      <tr key={school.id}>
                        <td className="num text-ink-muted">{school.code}</td>
                        <td className="font-medium text-ink">
                          <Link href={adminPath(eventId, `schools/${school.id}`)} className="hover:text-tkd-red">
                            {school.name}
                          </Link>
                        </td>
                        <td>
                          <StatusBadge status={school.status} />
                        </td>
                        <td className="num">{school.participants.length}</td>
                        <td className="num">{athletes}</td>
                        <td className="num">
                          {photos}/{school.participants.length}
                          {photos < school.participants.length && (
                            <span className="ml-1.5 text-xs text-amber-700">missing {school.participants.length - photos}</span>
                          )}
                        </td>
                        <td className="space-x-2 text-right">
                          {school.status === 'APPROVED' && school.participants.length > 0 ? (
                            <>
                              <Link
                                href={`/api/accreditation/school/batch?schoolId=${school.id}`}
                                className="btn-ghost btn-sm"
                                target="_blank"
                              >
                                Batch
                              </Link>
                              <Link
                                href={`/api/accreditation/school/individual?schoolId=${school.id}`}
                                className="btn-ghost btn-sm"
                                target="_blank"
                              >
                                Cards
                              </Link>
                            </>
                          ) : (
                            <span className="text-xs text-ink-muted">Locked</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        )}
      </div>
    </>
  );
}
