import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getEventBySlug } from '@/lib/db';
import { eventPath } from '@/lib/paths';
import { medalTally } from '@/lib/medals';
import { Card, Empty, MedalPips, Notice, PageHeader, Stat, TableWrap } from '@/components/ui';

export const metadata = { title: 'Medal tally' };
export const dynamic = 'force-dynamic';

export default async function MedalTallyPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ event?: string; cat?: string; gender?: string }>;
}) {
  const { slug } = await routeParams;
  const [event, params] = await Promise.all([getEventBySlug(slug), searchParams]);
  if (!event) notFound();

  if (!event.resultsPublished) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <PageHeader title="Medal tally" />
        <Notice kind="info">The medal tally goes live once results are published.</Notice>
      </div>
    );
  }

  const filter = {
    discipline: params.event as 'KYORUGI' | 'POOMSAE' | undefined,
    ageCategory: params.cat,
    gender: params.gender,
  };
  const { rows, totals } = await medalTally(event.id, event, filter);
  const championRow = [...rows].sort((a, b) => b.points - a.points || b.gold - a.gold)[0];

  const filtered = Boolean(params.event || params.cat || params.gender);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader
        title="Medal tally"
        subtitle="Auto-updating — every medal here comes from a bout or Poomsae category finalised by a referee panel. Nothing is tallied by hand."
      />

      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Gold" value={totals.gold} />
          <Stat label="Silver" value={totals.silver} />
          <Stat label="Bronze" value={totals.bronze} />
          <Stat label="Total medals" value={totals.total} />
        </div>

        {championRow && !filtered && (
          <Card
            title="Champion school"
            subtitle={`Weighted points — gold ${event.pointsGold}, silver ${event.pointsSilver}, bronze ${event.pointsBronze}.`}
          >
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-2xl font-semibold tracking-tight text-ink">{championRow.schoolName}</p>
                <p className="mt-1 text-sm text-ink-muted">
                  {championRow.points} points from {championRow.total} medal{championRow.total === 1 ? '' : 's'}
                </p>
              </div>
              <MedalPips gold={championRow.gold} silver={championRow.silver} bronze={championRow.bronze} />
            </div>
          </Card>
        )}

        <Card bodyClassName="card-pad">
          <form className="grid gap-3 sm:grid-cols-[auto_auto_auto_auto_1fr]">
            <select name="event" defaultValue={params.event ?? ''} className="select" aria-label="Discipline">
              <option value="">Both disciplines</option>
              <option value="KYORUGI">Kyorugi only</option>
              <option value="POOMSAE">Poomsae only</option>
            </select>
            <select name="cat" defaultValue={params.cat ?? ''} className="select" aria-label="Age category">
              <option value="">All age categories</option>
              <option value="YOUTH">Youth (11 &amp; under)</option>
              <option value="CADET">Cadet (12–14)</option>
              <option value="JUNIOR">Junior (15–17)</option>
            </select>
            <select name="gender" defaultValue={params.gender ?? ''} className="select" aria-label="Gender">
              <option value="">All genders</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
            </select>
            <button type="submit" className="btn-dark">
              Apply
            </button>
            {filtered && (
              <Link href={eventPath(slug, "medal-tally")} className="btn-quiet justify-self-start sm:justify-self-end">
                Clear filters
              </Link>
            )}
          </form>
        </Card>

        {rows.length === 0 ? (
          <Empty
            title="No medals awarded yet"
            hint={
              filtered
                ? 'No medals match that filter yet — try clearing it.'
                : 'The tally fills in live as each division is finalised.'
            }
          />
        ) : (
          <Card title={`${rows.length} school${rows.length === 1 ? '' : 's'} on the board`} bodyClassName="">
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>School</th>
                    <th className="!text-right">Gold</th>
                    <th className="!text-right">Silver</th>
                    <th className="!text-right">Bronze</th>
                    <th className="!text-right">Total</th>
                    <th className="!text-right">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.schoolId}>
                      <td className="num">{row.rank}</td>
                      <td className="font-medium text-ink">
                        {row.schoolName}
                        <span className="ml-2 num text-xs text-ink-muted">{row.schoolCode}</span>
                      </td>
                      <td className="num !text-right">{row.gold}</td>
                      <td className="num !text-right">{row.silver}</td>
                      <td className="num !text-right">{row.bronze}</td>
                      <td className="num !text-right font-semibold text-ink">{row.total}</td>
                      <td className="num !text-right">{row.points}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-surface-line">
                    <td />
                    <td className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      Total
                    </td>
                    <td className="num px-3 py-2.5 text-right font-semibold text-ink">{totals.gold}</td>
                    <td className="num px-3 py-2.5 text-right font-semibold text-ink">{totals.silver}</td>
                    <td className="num px-3 py-2.5 text-right font-semibold text-ink">{totals.bronze}</td>
                    <td className="num px-3 py-2.5 text-right font-semibold text-ink">{totals.total}</td>
                    <td className="num px-3 py-2.5 text-right font-semibold text-ink">{totals.points}</td>
                  </tr>
                </tfoot>
              </table>
            </TableWrap>
          </Card>
        )}

        <p className="text-xs leading-relaxed text-ink-muted">
          Ranking is by gold, then silver, then bronze. Kyorugi awards two bronze medals per division (both
          semi-final losers), per World Taekwondo competition rules.
        </p>
      </div>
    </div>
  );
}
