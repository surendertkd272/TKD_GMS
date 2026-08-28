import Link from 'next/link';
import { db, getSettings } from '@/lib/db';
import { Card, Empty, Notice, PageHeader, StatusBadge, TableWrap } from '@/components/ui';
import { AGE_CATEGORY_SHORT, type AgeCategory } from '@/lib/constants';

export const metadata = { title: 'Results & draws' };
export const dynamic = 'force-dynamic';

export default async function PublicResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; event?: string; cat?: string; gender?: string; school?: string }>;
}) {
  const [settings, params] = await Promise.all([getSettings(), searchParams]);

  if (!settings.resultsPublished) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <PageHeader title="Results & draws" />
        <Notice kind="info">
          Results are not published yet. They appear here live once the championship starts.
        </Notice>
      </div>
    );
  }

  const [categories, schools, athleteMatches] = await Promise.all([
    db.category.findMany({
      where: {
        drawStatus: { in: ['PUBLISHED', 'LOCKED'] },
        ...(params.event ? { event: params.event } : {}),
        ...(params.cat ? { ageCategory: params.cat } : {}),
        ...(params.gender ? { gender: params.gender } : {}),
        ...(params.school ? { entries: { some: { participant: { schoolId: params.school } } } } : {}),
      },
      include: {
        _count: { select: { entries: true, bouts: true } },
        results: {
          where: { medal: { not: null } },
          include: { entry: { include: { participant: { include: { school: { select: { code: true } } } } } } },
          orderBy: { position: 'asc' },
        },
      },
      orderBy: [{ event: 'asc' }, { sortOrder: 'asc' }],
    }),
    db.school.findMany({
      where: { status: 'APPROVED' },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    }),
    params.q
      ? db.participant.findMany({
          where: { name: { contains: params.q }, status: 'APPROVED' },
          include: {
            school: { select: { code: true, name: true } },
            entries: { include: { category: true, result: true } },
          },
          take: 25,
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader
        title="Results & draws"
        subtitle="Every published division, its bracket and its final standings. Search for an athlete, or filter by school, event and category."
      />

      <div className="space-y-6">
        <Card bodyClassName="card-pad">
          <form className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto_auto]">
            <input
              name="q"
              defaultValue={params.q ?? ''}
              placeholder="Search an athlete by name…"
              className="input"
              aria-label="Search athlete"
            />
            <select name="school" defaultValue={params.school ?? ''} className="select" aria-label="School">
              <option value="">All schools</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.code} — {school.name}
                </option>
              ))}
            </select>
            <select name="event" defaultValue={params.event ?? ''} className="select" aria-label="Event">
              <option value="">Both events</option>
              <option value="KYORUGI">Kyorugi</option>
              <option value="POOMSAE">Poomsae</option>
            </select>
            <select name="cat" defaultValue={params.cat ?? ''} className="select" aria-label="Age category">
              <option value="">All ages</option>
              <option value="YOUTH">Youth</option>
              <option value="CADET">Cadet</option>
              <option value="JUNIOR">Junior</option>
            </select>
            <button type="submit" className="btn-dark">
              Search
            </button>
          </form>
        </Card>

        {params.q && (
          <Card
            title={`Athlete search — “${params.q}”`}
            subtitle={`${athleteMatches.length} match${athleteMatches.length === 1 ? '' : 'es'}`}
            bodyClassName=""
          >
            {athleteMatches.length === 0 ? (
              <div className="card-pad text-sm text-ink-muted">No approved athlete matches that name.</div>
            ) : (
              <TableWrap>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Athlete</th>
                      <th>School</th>
                      <th>Category</th>
                      <th>Divisions</th>
                      <th>Result</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {athleteMatches.map((athlete) => (
                      <tr key={athlete.id}>
                        <td className="whitespace-nowrap font-medium text-ink">{athlete.name}</td>
                        <td className="text-xs">{athlete.school.name}</td>
                        <td className="whitespace-nowrap text-xs">
                          {AGE_CATEGORY_SHORT[athlete.ageCategory as AgeCategory]} ·{' '}
                          {athlete.gender === 'MALE' ? 'M' : 'F'}
                        </td>
                        <td className="text-xs">{athlete.entries.map((e) => e.category.name).join(', ') || '—'}</td>
                        <td className="space-x-1">
                          {athlete.entries.some((e) => e.result?.medal)
                            ? athlete.entries
                                .filter((e) => e.result?.medal)
                                .map((e) => <StatusBadge key={e.id} status={e.result!.medal!} />)
                            : '—'}
                        </td>
                        <td className="text-right">
                          <Link href={`/p/${athlete.code}`} className="btn-ghost btn-sm">
                            Profile
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Card>
        )}

        {categories.length === 0 ? (
          <Empty
            title="No published divisions yet"
            hint="Draws are published once registration closes. Until then, only the event information is live."
          />
        ) : (
          <Card title={`${categories.length} published division${categories.length === 1 ? '' : 's'}`} bodyClassName="">
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>Division</th>
                    <th>Event</th>
                    <th>Entries</th>
                    <th>Gold</th>
                    <th>Silver</th>
                    <th>Bronze</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {categories.map((category) => {
                    const gold = category.results.filter((r) => r.medal === 'GOLD');
                    const silver = category.results.filter((r) => r.medal === 'SILVER');
                    const bronze = category.results.filter((r) => r.medal === 'BRONZE');
                    const name = (list: typeof gold) =>
                      list.length === 0
                        ? '—'
                        : list
                            .map((r) => `${r.entry.participant.name} (${r.entry.participant.school.code})`)
                            .join(', ');

                    return (
                      <tr key={category.id}>
                        <td className="whitespace-nowrap font-medium text-ink">{category.name}</td>
                        <td className="text-xs uppercase tracking-wide text-ink-muted">
                          {category.event.toLowerCase()}
                        </td>
                        <td className="num">{category._count.entries}</td>
                        <td className="text-xs">{name(gold)}</td>
                        <td className="text-xs">{name(silver)}</td>
                        <td className="text-xs">{name(bronze)}</td>
                        <td>
                          {category.finalized ? (
                            <span className="badge-green">Final</span>
                          ) : (
                            <span className="badge-amber">In progress</span>
                          )}
                        </td>
                        <td className="text-right">
                          <Link href={`/results/${category.id}`} className="btn-ghost btn-sm">
                            {category.event === 'KYORUGI' ? 'Bracket' : 'Standings'}
                          </Link>
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
    </div>
  );
}
