import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { db, getEventById } from '@/lib/db';
import { Card, Empty, Notice, PageHeader, Stat, StatusBadge, TableWrap } from '@/components/ui';
import { DrawControls } from './DrawControls';
import { adminPath } from '@/lib/paths';

export const metadata = { title: 'Draws & brackets' };
export const dynamic = 'force-dynamic';

export default async function AdminDrawsPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ event?: string; status?: string; withEntries?: string }>;
}) {
  await requireAdmin();
  const [{ eventId }, params] = await Promise.all([routeParams, searchParams]);
  const event = await getEventById(eventId);
  if (!event) notFound();

  const categories = await db.category.findMany({
    where: { eventId,
      active: true,
      ...(params.event ? { discipline: params.event } : {}),
      ...(params.status ? { drawStatus: params.status } : {}),
      ...(params.withEntries === '0' ? {} : { entries: { some: {} } }),
    },
    include: {
      _count: { select: { entries: true, bouts: true } },
      entries: { select: { participant: { select: { status: true } } } },
    },
    orderBy: [{ discipline: 'asc' }, { sortOrder: 'asc' }],
  });

  const counts = await db.category.groupBy({ by: ['drawStatus'], where: { eventId, active: true }, _count: true });
  const byStatus = Object.fromEntries(counts.map((c) => [c.drawStatus, c._count]));

  return (
    <>
      <PageHeader
        title="Draws & brackets"
        subtitle="Kyorugi generates a seeded single-elimination bracket with automatic byes; Poomsae generates a randomised performance order."
        actions={
          <Link href={adminPath(eventId, 'draws/print')} className="btn-ghost" target="_blank">
            Print paper backup
          </Link>
        }
      />

      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Draft" value={byStatus.DRAFT ?? 0} hint="Not generated" />
          <Stat label="Generated" value={byStatus.GENERATED ?? 0} hint="Not yet public" />
          <Stat label="Published" value={byStatus.PUBLISHED ?? 0} hint="Visible to all" />
          <Stat label="Locked" value={byStatus.LOCKED ?? 0} hint="Finalised" />
        </div>

        {!event.drawsPublished && (byStatus.GENERATED ?? 0) > 0 && (
          <Notice kind="info">
            {byStatus.GENERATED} draw{byStatus.GENERATED === 1 ? '' : 's'} generated but not published.
            Publishing makes them visible to schools and the public page, and locks registration.
          </Notice>
        )}

        <DrawControls generatedCount={byStatus.GENERATED ?? 0} />

        <Card bodyClassName="card-pad">
          <form className="grid gap-3 sm:grid-cols-[auto_auto_auto_auto]">
            <select name="event" defaultValue={params.event ?? ''} className="select">
              <option value="">Both disciplines</option>
              <option value="KYORUGI">Kyorugi</option>
              <option value="POOMSAE">Poomsae</option>
            </select>
            <select name="status" defaultValue={params.status ?? ''} className="select">
              <option value="">Any draw status</option>
              <option value="DRAFT">Draft</option>
              <option value="GENERATED">Generated</option>
              <option value="PUBLISHED">Published</option>
              <option value="LOCKED">Locked</option>
            </select>
            <select name="withEntries" defaultValue={params.withEntries ?? '1'} className="select">
              <option value="1">Only categories with entries</option>
              <option value="0">Show all 64 categories</option>
            </select>
            <button type="submit" className="btn-dark">
              Filter
            </button>
          </form>
        </Card>

        {categories.length === 0 ? (
          <Empty
            title="No categories with entries yet"
            hint="Draws can be generated once approved schools have entered athletes. Switch the filter to see the full division grid."
          />
        ) : (
          <Card bodyClassName="">
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Category</th>
                    <th>Discipline</th>
                    <th>Entries</th>
                    <th>Approved</th>
                    <th>Bouts</th>
                    <th>Draw</th>
                    <th>Finalised</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {categories.map((category) => {
                    const approved = category.entries.filter((e) => e.participant.status === 'APPROVED').length;
                    return (
                      <tr key={category.id}>
                        <td className="num text-xs text-ink-muted">{category.code}</td>
                        <td className="whitespace-nowrap font-medium text-ink">{category.name}</td>
                        <td className="text-xs uppercase tracking-wide text-ink-muted">
                          {category.discipline.toLowerCase()}
                        </td>
                        <td className="num">{category._count.entries}</td>
                        <td className="num">
                          {approved}
                          {approved < category._count.entries && (
                            <span className="ml-1.5 text-xs text-amber-700">
                              ({category._count.entries - approved} pending)
                            </span>
                          )}
                        </td>
                        <td className="num">{category._count.bouts || '—'}</td>
                        <td>
                          <StatusBadge status={category.drawStatus} />
                        </td>
                        <td>{category.finalized ? <span className="badge-green">Yes</span> : '—'}</td>
                        <td className="text-right">
                          <Link href={adminPath(eventId, `draws/${category.id}`)} className="btn-ghost btn-sm">
                            Manage
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
    </>
  );
}
