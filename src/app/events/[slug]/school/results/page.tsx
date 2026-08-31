import Link from 'next/link';
import { requireSchool } from '@/lib/auth';
import { db } from '@/lib/db';
import { medalTally } from '@/lib/medals';
import { Card, Empty, MedalPips, PageHeader, Stat, StatusBadge, TableWrap } from '@/components/ui';
import { eventPath } from '@/lib/paths';

export const metadata = { title: 'Our results' };
export const dynamic = 'force-dynamic';

export default async function SchoolResultsPage() {
  const { school, event } = await requireSchool();

  const [results, tally] = await Promise.all([
    db.result.findMany({
      where: { entry: { participant: { schoolId: school.id } } },
      include: { category: true, entry: { include: { participant: true } } },
      orderBy: [{ position: 'asc' }, { category: { sortOrder: 'asc' } }],
    }),
    medalTally(event.id, event),
  ]);

  const ourRow = tally.rows.find((r) => r.schoolId === school.id);
  const medalled = results.filter((r) => r.medal);

  return (
    <>
      <PageHeader
        title="Our results"
        subtitle="Updates the instant a referee panel finalises a bout or a Poomsae category."
        actions={
          <Link href={eventPath(event.slug, 'medal-tally')} className="btn-ghost">
            Full medal tally
          </Link>
        }
      />

      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Medals" value={ourRow?.total ?? 0} />
          <Stat
            label="Gold / Silver / Bronze"
            value={<MedalPips gold={ourRow?.gold ?? 0} silver={ourRow?.silver ?? 0} bronze={ourRow?.bronze ?? 0} />}
          />
          <Stat label="Championship points" value={ourRow?.points ?? 0} hint="Weighted school award" />
          <Stat
            label="Position"
            value={ourRow ? `#${ourRow.rank}` : '—'}
            hint={`of ${tally.rows.length} school${tally.rows.length === 1 ? '' : 's'} with medals`}
          />
        </div>

        {results.length === 0 ? (
          <Empty
            title="No finalised results yet"
            hint="Results appear here bout by bout as the championship runs — nothing has to be requested or refreshed manually."
          />
        ) : (
          <>
            {medalled.length > 0 && (
              <Card title="Medals" bodyClassName="">
                <TableWrap>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Athlete</th>
                        <th>Division</th>
                        <th>Discipline</th>
                        <th>Position</th>
                        <th>Medal</th>
                        <th>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {medalled.map((result) => (
                        <tr key={result.id}>
                          <td className="font-medium text-ink">{result.entry.participant.name}</td>
                          <td>{result.category.name}</td>
                          <td className="text-xs uppercase tracking-wide text-ink-muted">
                            {result.category.discipline.toLowerCase()}
                          </td>
                          <td className="num">{result.position}</td>
                          <td>
                            <StatusBadge status={result.medal!} />
                          </td>
                          <td className="num">{result.score != null ? result.score.toFixed(2) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              </Card>
            )}

            <Card
              title="All finalised entries"
              subtitle="Every athlete in a completed division, medal or not — each one earns a participation certificate."
              bodyClassName=""
            >
              <TableWrap>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Athlete</th>
                      <th>Division</th>
                      <th>Result</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result) => (
                      <tr key={result.id}>
                        <td className="font-medium text-ink">{result.entry.participant.name}</td>
                        <td>{result.category.name}</td>
                        <td>
                          {result.medal ? (
                            <StatusBadge status={result.medal} />
                          ) : (
                            <span className="text-ink-muted">Participated</span>
                          )}
                        </td>
                        <td className="text-right">
                          <Link href={eventPath(event.slug, `results/${result.categoryId}`)} className="btn-ghost btn-sm">
                            Bracket
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
