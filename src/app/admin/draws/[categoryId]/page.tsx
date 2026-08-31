import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { BOUT_INCLUDE, BracketView, toBracketView } from '@/components/BracketView';
import { Card, Empty, Notice, PageHeader, Stat, StatusBadge, TableWrap } from '@/components/ui';
import { CategoryDrawPanel } from './CategoryDrawPanel';
import { AGE_CATEGORY_SHORT, type AgeCategory } from '@/lib/constants';
import { computePoomsaeScore } from '@/lib/poomsae';

export const dynamic = 'force-dynamic';

export default async function AdminCategoryDraw({ params }: { params: Promise<{ categoryId: string }> }) {
  await requireAdmin();
  const { categoryId } = await params;

  const category = await db.category.findUnique({
    where: { id: categoryId },
    include: {
      entries: {
        include: {
          participant: { include: { school: { select: { code: true, name: true } } } },
          poomsaeScores: { include: { judge: { select: { name: true } } } },
          result: true,
        },
        orderBy: [{ seed: 'asc' }, { participant: { name: 'asc' } }],
      },
      bouts: { include: BOUT_INCLUDE, orderBy: [{ round: 'asc' }, { position: 'asc' }] },
      results: { include: { entry: { include: { participant: { include: { school: true } } } } }, orderBy: { position: 'asc' } },
    },
  });
  if (!category) notFound();

  const approvedEntries = category.entries.filter((e) => e.participant.status === 'APPROVED');
  const isKyorugi = category.event === 'KYORUGI';

  return (
    <>
      <PageHeader
        title={category.name}
        subtitle={
          <>
            <span className="num">{category.code}</span> · {category.event.toLowerCase()} ·{' '}
            {AGE_CATEGORY_SHORT[category.ageCategory as AgeCategory]} ·{' '}
            {category.gender === 'MIXED' ? 'Mixed' : category.gender === 'MALE' ? 'Male' : 'Female'}
            {category.weightLabel ? ` · ${category.weightLabel}` : ''} · <StatusBadge status={category.drawStatus} />
          </>
        }
        actions={
          <>
            <Link href={`/admin/draws/print?categoryId=${category.id}`} className="btn-ghost" target="_blank">
              Print
            </Link>
            <Link href={`/results/${category.id}`} className="btn-ghost" target="_blank">
              Public view
            </Link>
            <Link href="/admin/draws" className="btn-quiet">
              All draws
            </Link>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Entries" value={category.entries.length} />
            <Stat label="Approved" value={approvedEntries.length} />
            <Stat label="Bouts" value={category.bouts.length || '—'} />
            <Stat label="Medals" value={category.results.filter((r) => r.medal).length} />
          </div>

          {approvedEntries.length === 0 && (
            <Notice kind="warn">
              No approved entries yet. Approve the schools involved before generating a draw — pending
              participants are excluded.
            </Notice>
          )}

          {isKyorugi ? (
            <Card
              title="Bracket"
              subtitle="Higher seed takes the red corner. Byes are resolved automatically and cascade forward."
              bodyClassName=""
            >
              <BracketView bouts={category.bouts.map((b) => toBracketView(b, `/admin/live?bout=${b.id}`))} />
            </Card>
          ) : (
            <Card
              title="Performance order & judge scores"
              subtitle="Each judge submits independently; the highest and lowest totals are discarded once five or more judges have scored."
              bodyClassName=""
            >
              {category.entries.length === 0 ? (
                <div className="card-pad">
                  <Empty title="No entries yet" />
                </div>
              ) : (
                <TableWrap>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Athlete</th>
                        <th>School</th>
                        <th>Judges</th>
                        <th>Scores</th>
                        <th>Final</th>
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
                            <td className="num">{entry.poomsaeScores.length}</td>
                            <td className="num text-xs">
                              {entry.poomsaeScores.length === 0
                                ? '—'
                                : entry.poomsaeScores.map((s) => s.total.toFixed(2)).join(' · ')}
                            </td>
                            <td className="num font-semibold text-ink">
                              {entry.poomsaeFinalScore != null
                                ? entry.poomsaeFinalScore.toFixed(2)
                                : computation.judgeCount
                                  ? `${computation.finalScore.toFixed(2)}*`
                                  : '—'}
                            </td>
                            <td>
                              {entry.result?.medal ? (
                                <StatusBadge status={entry.result.medal} />
                              ) : (
                                <span className="num">{entry.poomsaeRank ?? '—'}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="px-5 py-3 text-xs text-ink-muted">
                    * provisional — becomes final when the category is finalised.
                  </p>
                </TableWrap>
              )}
            </Card>
          )}

          <Card title="Entry list" subtitle="Seeds are assigned when the draw is generated." bodyClassName="">
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>Seed</th>
                    <th>Athlete</th>
                    <th>School</th>
                    <th>Weight</th>
                    <th>Belt</th>
                    <th>Participant status</th>
                    <th>Entry</th>
                  </tr>
                </thead>
                <tbody>
                  {category.entries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="num">{entry.seed ?? '—'}</td>
                      <td className="whitespace-nowrap font-medium text-ink">{entry.participant.name}</td>
                      <td className="whitespace-nowrap text-xs">{entry.participant.school.name}</td>
                      <td className="num">{entry.participant.weightKg} kg</td>
                      <td className="whitespace-nowrap text-xs">{entry.participant.beltGrade}</td>
                      <td>
                        <StatusBadge status={entry.participant.status} />
                      </td>
                      <td>
                        <StatusBadge status={entry.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        </div>

        <div className="space-y-6">
          <CategoryDrawPanel
            categoryId={category.id}
            event={category.event}
            drawStatus={category.drawStatus}
            finalized={category.finalized}
            approvedEntries={approvedEntries.length}
          />

          {category.results.length > 0 && (
            <Card title="Final standings" bodyClassName="">
              <ul className="divide-y divide-surface-line">
                {category.results
                  .filter((r) => r.medal)
                  .map((result) => (
                    <li key={result.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{result.entry.participant.name}</p>
                        <p className="truncate text-xs text-ink-muted">{result.entry.participant.school.name}</p>
                      </div>
                      <StatusBadge status={result.medal!} />
                    </li>
                  ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
