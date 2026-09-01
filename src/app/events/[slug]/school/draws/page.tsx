import Link from 'next/link';
import { requireSchool } from '@/lib/auth';
import { db } from '@/lib/db';
import { Card, Empty, Notice, PageHeader, StatusBadge, TableWrap } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
import { eventPath } from '@/lib/paths';

export const metadata = { title: 'Draws & schedule' };
export const dynamic = 'force-dynamic';

export default async function SchoolDrawsPage() {
  const { school, event } = await requireSchool();

  const entries = await db.entry.findMany({
    where: {
      participant: { schoolId: school.id },
      category: { drawStatus: { in: ['PUBLISHED', 'LOCKED'] } },
    },
    include: {
      participant: true,
      category: true,
      redBouts: { include: { mat: true, blueEntry: { include: { participant: { include: { school: true } } } } } },
      blueBouts: { include: { mat: true, redEntry: { include: { participant: { include: { school: true } } } } } },
    },
    orderBy: [{ category: { sortOrder: 'asc' } }, { participant: { name: 'asc' } }],
  });

  const bouts = await db.bout.findMany({
    where: {
      category: { drawStatus: { in: ['PUBLISHED', 'LOCKED'] } },
      OR: [
        { redEntry: { participant: { schoolId: school.id } } },
        { blueEntry: { participant: { schoolId: school.id } } },
      ],
    },
    include: {
      category: true,
      mat: true,
      redEntry: { include: { participant: { include: { school: true } } } },
      blueEntry: { include: { participant: { include: { school: true } } } },
    },
    orderBy: [{ scheduledAt: 'asc' }, { round: 'asc' }, { position: 'asc' }],
  });

  return (
    <>
      <PageHeader
        title="Draws & schedule"
        subtitle="Your athletes' bouts and performance order, as published by the organising team."
      />

      <div className="space-y-6">
        {!event.drawsPublished && (
          <Notice kind="info">
            Draws have not been published yet. They are generated once registration closes and appear
            here and on the public page at the same moment.
          </Notice>
        )}

        {bouts.length === 0 && entries.length === 0 ? (
          <Empty
            title="Nothing published for your school yet"
            hint="Once the organising team publishes the draws for your athletes' divisions, every bout, mat and time appears here."
          />
        ) : (
          <>
            <Card title="Our bouts" subtitle={`${bouts.length} bout${bouts.length === 1 ? '' : 's'} involving your athletes.`} bodyClassName="">
              {bouts.length === 0 ? (
                <div className="card-pad text-sm text-ink-muted">No Kyorugi bouts published yet.</div>
              ) : (
                <TableWrap>
                  <table className="table table-cards">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Time</th>
                        <th>Mat</th>
                        <th>Category</th>
                        <th>Round</th>
                        <th>Red corner</th>
                        <th>Blue corner</th>
                        <th>Status</th>
                        <th>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bouts.map((bout) => {
                        const ourRed = bout.redEntry?.participant.schoolId === school.id;
                        const ourBlue = bout.blueEntry?.participant.schoolId === school.id;
                        return (
                          <tr key={bout.id}>
                            <td className="num text-ink-muted" data-label="#">{bout.boutNumber || '—'}</td>
                            <td className="num whitespace-nowrap" data-label="Time">{fmtDateTime(bout.scheduledAt)}</td>
                            <td className="whitespace-nowrap" data-label="Mat">{bout.mat?.name ?? '—'}</td>
                            <td className="text-ink" data-label="Category">{bout.category.name}</td>
                            <td className="whitespace-nowrap" data-label="Round">{bout.roundLabel}</td>
                            <td className={ourRed ? 'font-semibold text-ink' : ''} data-label="Red corner">
                              {bout.redEntry?.participant.name ?? 'TBD'}
                              <span className="ml-1.5 text-xs text-ink-muted">
                                {bout.redEntry?.participant.school.code}
                              </span>
                            </td>
                            <td className={ourBlue ? 'font-semibold text-ink' : ''} data-label="Blue corner">
                              {bout.blueEntry?.participant.name ?? 'TBD'}
                              <span className="ml-1.5 text-xs text-ink-muted">
                                {bout.blueEntry?.participant.school.code}
                              </span>
                            </td>
                            <td data-label="Status">
                              <StatusBadge status={bout.status} />
                            </td>
                            <td className="num" data-label="Score">
                              {bout.status === 'COMPLETED' ? `${bout.redScore}–${bout.blueScore}` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </Card>

            <Card title="Divisions our athletes are drawn in" bodyClassName="">
              <TableWrap>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Athlete</th>
                      <th>Division</th>
                      <th>Discipline</th>
                      <th>Seed</th>
                      <th>Draw</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="font-medium text-ink">{entry.participant.name}</td>
                        <td>{entry.category.name}</td>
                        <td className="text-xs uppercase tracking-wide text-ink-muted">
                          {entry.category.discipline.toLowerCase()}
                        </td>
                        <td className="num">{entry.seed ?? '—'}</td>
                        <td>
                          <StatusBadge status={entry.category.drawStatus} />
                        </td>
                        <td className="text-right">
                          <Link href={eventPath(event.slug, `results/${entry.categoryId}`)} className="btn-ghost btn-sm">
                            View bracket
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
