import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { db, getEventById } from '@/lib/db';
import { Card, PageHeader, Stat, TableWrap } from '@/components/ui';
import { NewOfficialForm } from './NewOfficialForm';
import { OfficialRow } from './OfficialRow';

export const metadata = { title: 'Referees & jury' };
export const dynamic = 'force-dynamic';

export default async function AdminOfficialsPage({ params }: { params: Promise<{ eventId: string }> }) {
  await requireAdmin();
  const { eventId } = await params;
  const event = await getEventById(eventId);
  if (!event) notFound();

  const [officials, mats] = await Promise.all([
    db.user.findMany({
      where: { eventId, role: 'REFEREE' },
      include: {
        assignedMat: { select: { name: true } },
        _count: { select: { refereedBouts: true, poomsaeScores: true } },
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    }),
    db.mat.findMany({ where: { eventId, active: true }, orderBy: { sortOrder: 'asc' } }),
  ]);

  return (
    <>
      <PageHeader
        title="Referees & jury"
        subtitle="Scoring-panel accounts. Each login is scoped to the mat it is assigned to; jury members can also score Poomsae categories."
      />

      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Officials" value={officials.length} />
          <Stat label="Active" value={officials.filter((o) => o.active).length} />
          <Stat label="On a mat" value={officials.filter((o) => o.assignedMatId).length} />
          <Stat label="Jury (Poomsae)" value={officials.filter((o) => o.isJury).length} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card title="Panel" bodyClassName="">
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Certification</th>
                    <th>Bouts</th>
                    <th>Assignment</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {officials.map((official) => (
                    <OfficialRow
                      key={official.id}
                      official={{
                        id: official.id,
                        name: official.name,
                        email: official.email,
                        certification: official.certification,
                        assignedMatId: official.assignedMatId,
                        isJury: official.isJury,
                        active: official.active,
                        boutCount: official._count.refereedBouts,
                        scoreCount: official._count.poomsaeScores,
                      }}
                      mats={mats.map((m) => ({ id: m.id, name: m.name }))}
                    />
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>

          <NewOfficialForm mats={mats.map((m) => ({ id: m.id, name: m.name }))} />
        </div>
      </div>
    </>
  );
}
