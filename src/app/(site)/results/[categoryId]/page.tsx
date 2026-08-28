import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db, getSettings } from '@/lib/db';
import { BOUT_INCLUDE, BracketView, toBracketView } from '@/components/BracketView';
import { Card, Empty, Notice, PageHeader, StatusBadge, TableWrap } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
import { AGE_CATEGORY_SHORT, type AgeCategory } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ categoryId: string }> }) {
  const { categoryId } = await params;
  const category = await db.category.findUnique({ where: { id: categoryId }, select: { name: true } });
  return { title: category?.name ?? 'Division' };
}

export default async function PublicCategoryPage({ params }: { params: Promise<{ categoryId: string }> }) {
  const [settings, { categoryId }] = await Promise.all([getSettings(), params]);

  const category = await db.category.findUnique({
    where: { id: categoryId },
    include: {
      bouts: { include: BOUT_INCLUDE, orderBy: [{ round: 'asc' }, { position: 'asc' }] },
      entries: {
        where: { status: 'ACTIVE' },
        include: {
          participant: { include: { school: { select: { code: true, name: true } } } },
          result: true,
        },
        orderBy: [{ poomsaeRank: 'asc' }, { seed: 'asc' }],
      },
      results: {
        include: { entry: { include: { participant: { include: { school: { select: { code: true, name: true } } } } } } },
        orderBy: { position: 'asc' },
      },
    },
  });
  if (!category) notFound();

  const isPublic = category.drawStatus === 'PUBLISHED' || category.drawStatus === 'LOCKED';
  if (!isPublic || !settings.resultsPublished) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <PageHeader title={category.name} />
        <Notice kind="info">
          This division's draw has not been published yet. It appears here the moment the organising team
          publishes it.
        </Notice>
        <Link href="/results" className="btn-ghost mt-4">
          Back to results
        </Link>
      </div>
    );
  }

  const medals = category.results.filter((r) => r.medal);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader
        title={category.name}
        subtitle={
          <>
            {category.event === 'KYORUGI' ? 'Kyorugi — single elimination' : 'Poomsae — ranked scoring'} ·{' '}
            {AGE_CATEGORY_SHORT[category.ageCategory as AgeCategory]} ·{' '}
            {category.gender === 'MIXED' ? 'Mixed' : category.gender === 'MALE' ? 'Male' : 'Female'} ·{' '}
            {category.entries.length} entr{category.entries.length === 1 ? 'y' : 'ies'} ·{' '}
            {category.finalized ? <span className="badge-green">Final</span> : <span className="badge-amber">In progress</span>}
          </>
        }
        actions={
          <Link href="/results" className="btn-quiet">
            All divisions
          </Link>
        }
      />

      <div className="space-y-6">
        {medals.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-3">
            {(['GOLD', 'SILVER', 'BRONZE'] as const).map((medal) => {
              const winners = medals.filter((m) => m.medal === medal);
              const accent =
                medal === 'GOLD'
                  ? 'border-amber-300 bg-amber-50/60'
                  : medal === 'SILVER'
                    ? 'border-slate-300 bg-slate-50'
                    : 'border-orange-300 bg-orange-50/60';
              return (
                <div key={medal} className={`rounded-lg border p-4 ${accent}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                    {medal.toLowerCase()}
                  </p>
                  {winners.length === 0 ? (
                    <p className="mt-1 text-sm text-ink-muted">Not decided</p>
                  ) : (
                    winners.map((winner) => (
                      <div key={winner.id} className="mt-1">
                        <p className="text-base font-semibold leading-tight text-ink">
                          {winner.entry.participant.name}
                        </p>
                        <p className="text-xs text-ink-muted">{winner.entry.participant.school.name}</p>
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        )}

        {category.event === 'KYORUGI' ? (
          <Card
            title="Bracket"
            subtitle="Red corner is the higher seed. Byes are shown where the draw was uneven."
            bodyClassName=""
          >
            <BracketView bouts={category.bouts.map((b) => toBracketView(b))} />
          </Card>
        ) : (
          <Card title="Standings" subtitle="Judge scores are averaged after discarding the highest and lowest." bodyClassName="">
            {category.entries.length === 0 ? (
              <div className="card-pad">
                <Empty title="No entries" />
              </div>
            ) : (
              <TableWrap>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Performer</th>
                      <th>School</th>
                      <th>Score</th>
                      <th>Medal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {category.entries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="num">{entry.poomsaeRank ?? '—'}</td>
                        <td className="whitespace-nowrap font-medium text-ink">{entry.participant.name}</td>
                        <td className="text-xs">{entry.participant.school.name}</td>
                        <td className="num">
                          {entry.poomsaeFinalScore != null ? entry.poomsaeFinalScore.toFixed(2) : '—'}
                        </td>
                        <td>{entry.result?.medal ? <StatusBadge status={entry.result.medal} /> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Card>
        )}

        {category.event === 'KYORUGI' && category.bouts.length > 0 && (
          <Card title="Bout list" bodyClassName="">
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Round</th>
                    <th>Red</th>
                    <th>Blue</th>
                    <th>Score</th>
                    <th>Mat / time</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {category.bouts.map((bout) => (
                    <tr key={bout.id}>
                      <td className="num text-ink-muted">{bout.boutNumber || '—'}</td>
                      <td className="whitespace-nowrap">{bout.roundLabel}</td>
                      <td className={bout.winnerEntryId === bout.redEntryId ? 'font-semibold text-ink' : ''}>
                        {bout.redEntry?.participant.name ?? 'TBD'}
                      </td>
                      <td className={bout.winnerEntryId === bout.blueEntryId ? 'font-semibold text-ink' : ''}>
                        {bout.blueEntry?.participant.name ?? 'TBD'}
                      </td>
                      <td className="num whitespace-nowrap">
                        {bout.status === 'COMPLETED' ? `${bout.redScore}–${bout.blueScore}` : '—'}
                        {bout.resultType && bout.resultType !== 'POINTS' && (
                          <span className="ml-1.5 text-xs text-ink-muted">{bout.resultType}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-xs">
                        {bout.mat?.name ?? '—'}
                        {bout.scheduledAt ? ` · ${fmtDateTime(bout.scheduledAt)}` : ''}
                      </td>
                      <td>
                        <StatusBadge status={bout.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        )}
      </div>
    </div>
  );
}
