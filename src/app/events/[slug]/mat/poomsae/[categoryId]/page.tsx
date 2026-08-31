import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireReferee } from '@/lib/auth';
import { db } from '@/lib/db';
import { computePoomsaeScore } from '@/lib/poomsae';
import { Card, Empty, Notice, PageHeader, Stat, StatusBadge, TableWrap } from '@/components/ui';
import { PoomsaeScoreForm } from './PoomsaeScoreForm';
import { matPath } from '@/lib/paths';

export const dynamic = 'force-dynamic';

export default async function PoomsaeCategoryPage({ params }: { params: Promise<{ categoryId: string }> }) {
  const [{ session, user, event }, { categoryId }] = await Promise.all([requireReferee(), params]);

  const category = await db.category.findUnique({
    where: { id: categoryId },
    include: {
      entries: {
        where: { status: 'ACTIVE' },
        include: {
          participant: { include: { school: { select: { code: true } } } },
          poomsaeScores: { include: { judge: { select: { id: true, name: true } } } },
        },
        orderBy: [{ seed: 'asc' }, { participant: { name: 'asc' } }],
      },
    },
  });
  if (!category) notFound();
  if (category.discipline !== 'POOMSAE') notFound();

  if (!user.isJury) {
    return (
      <>
        <PageHeader title={category.name} subtitle="Poomsae judging is reserved for the jury panel." />
        <Notice kind="warn">Your account is not marked as a Poomsae jury member.</Notice>
      </>
    );
  }

  const myScored = category.entries.filter((e) => e.poomsaeScores.some((s) => s.judgeId === session.userId)).length;
  const judgeIds = new Set(category.entries.flatMap((e) => e.poomsaeScores.map((s) => s.judgeId)));

  return (
    <>
      <PageHeader
        title={category.name}
        subtitle={
          <>
            {category.entries.length} performer{category.entries.length === 1 ? '' : 's'} ·{' '}
            {judgeIds.size} judge{judgeIds.size === 1 ? '' : 's'} have scored · <StatusBadge status={category.drawStatus} />
          </>
        }
        actions={
          <Link href={matPath(event.slug, 'poomsae')} className="btn-quiet">
            All categories
          </Link>
        }
      />

      <div className="space-y-6">
        {category.finalized && (
          <Notice kind="info">
            This category is finalised — scores are locked. The standings below are the official result.
          </Notice>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Performers" value={category.entries.length} />
          <Stat label="Scored by you" value={`${myScored}/${category.entries.length}`} />
          <Stat label="Judges on the panel" value={judgeIds.size} hint={judgeIds.size >= 5 ? 'High/low discarded' : 'Straight average'} />
        </div>

        {category.entries.length === 0 ? (
          <Empty title="No performers in this category" />
        ) : (
          <>
            <Card
              title="Your scoring sheet"
              subtitle="Accuracy out of 4.0 and presentation out of 6.0. Both start at maximum — deduct as you judge."
              bodyClassName=""
            >
              {category.entries.map((entry) => {
                const mine = entry.poomsaeScores.find((s) => s.judgeId === session.userId);
                return (
                  <PoomsaeScoreForm
                    key={entry.id}
                    entryId={entry.id}
                    athleteName={entry.participant.name}
                    schoolCode={entry.participant.school.code}
                    order={entry.seed}
                    existing={mine ? { accuracy: mine.accuracy, presentation: mine.presentation, total: mine.total } : null}
                    disabled={category.finalized}
                  />
                );
              })}
            </Card>

            <Card
              title="Panel view"
              subtitle="Every judge's total. The computed score is provisional until a Super Admin finalises the category."
              bodyClassName=""
            >
              <TableWrap>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Performer</th>
                      <th>School</th>
                      <th>Judge totals</th>
                      <th>Discarded</th>
                      <th>Computed</th>
                      <th>Rank</th>
                    </tr>
                  </thead>
                  <tbody>
                    {category.entries.map((entry) => {
                      const computation = computePoomsaeScore(
                        entry.poomsaeScores.map((s) => ({
                          judgeId: s.judgeId,
                          accuracy: s.accuracy,
                          presentation: s.presentation,
                          total: s.total,
                        })),
                      );
                      return (
                        <tr key={entry.id}>
                          <td className="num">{entry.seed ?? '—'}</td>
                          <td className="whitespace-nowrap font-medium text-ink">{entry.participant.name}</td>
                          <td className="text-xs">{entry.participant.school.code}</td>
                          <td className="num text-xs">
                            {entry.poomsaeScores.length === 0
                              ? '—'
                              : entry.poomsaeScores.map((s) => s.total.toFixed(2)).join(' · ')}
                          </td>
                          <td className="num text-xs text-ink-muted">
                            {computation.dropped.high != null
                              ? `${computation.dropped.low!.toFixed(2)} / ${computation.dropped.high.toFixed(2)}`
                              : '—'}
                          </td>
                          <td className="num font-semibold text-ink">
                            {computation.judgeCount ? computation.finalScore.toFixed(2) : '—'}
                          </td>
                          <td className="num">{entry.poomsaeRank ?? '—'}</td>
                        </tr>
                      );
                    })}
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
