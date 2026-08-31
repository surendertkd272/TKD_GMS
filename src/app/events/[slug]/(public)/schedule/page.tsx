import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db, getEventBySlug } from '@/lib/db';
import { Card, Empty, Notice, PageHeader, StatusBadge, TableWrap } from '@/components/ui';
import { fmtDate, fmtTime } from '@/lib/format';
import { eventPath } from '@/lib/paths';

export const metadata = { title: 'Schedule' };
export const dynamic = 'force-dynamic';

export default async function PublicSchedulePage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ mat?: string; school?: string; cat?: string }>;
}) {
  const { slug } = await routeParams;
  const [event, params] = await Promise.all([getEventBySlug(slug), searchParams]);
  if (!event) notFound();

  const [mats, schools, bouts] = await Promise.all([
    db.mat.findMany({ where: { eventId: event.id, active: true }, orderBy: { sortOrder: 'asc' } }),
    db.school.findMany({ where: { eventId: event.id, status: 'APPROVED' }, select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } }),
    db.bout.findMany({
      where: {
        status: { not: 'BYE' },
        category: {
          eventId: event.id,
          drawStatus: { in: ['PUBLISHED', 'LOCKED'] },
          ...(params.cat ? { ageCategory: params.cat } : {}),
        },
        ...(params.mat ? { matId: params.mat } : {}),
        ...(params.school
          ? {
              OR: [
                { redEntry: { participant: { schoolId: params.school } } },
                { blueEntry: { participant: { schoolId: params.school } } },
              ],
            }
          : {}),
      },
      include: {
        category: { select: { id: true, name: true, discipline: true } },
        mat: { select: { name: true } },
        redEntry: { include: { participant: { include: { school: { select: { code: true } } } } } },
        blueEntry: { include: { participant: { include: { school: { select: { code: true } } } } } },
      },
      orderBy: [{ scheduledAt: 'asc' }, { boutNumber: 'asc' }],
      take: 400,
    }),
  ]);

  // Group by calendar day so a two-day event reads correctly.
  const byDay = new Map<string, typeof bouts>();
  for (const bout of bouts) {
    const key = bout.scheduledAt ? fmtDate(bout.scheduledAt) : 'Time to be confirmed';
    byDay.set(key, [...(byDay.get(key) ?? []), bout]);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader
        title="Schedule"
        subtitle={`${event.venue} · ${fmtDate(event.startDate)} – ${fmtDate(event.endDate)}. Filter by mat, school or age category.`}
      />

      <div className="space-y-6">
        {!event.drawsPublished && (
          <Notice kind="info">
            The bout schedule is published together with the draws, once registration closes.
          </Notice>
        )}

        {(bouts.length > 0 || params.mat || params.school || params.cat) && (
        <Card bodyClassName="card-pad">
          <form className="grid gap-3 sm:grid-cols-[auto_auto_auto_auto]">
            <select name="mat" defaultValue={params.mat ?? ''} className="select" aria-label="Mat">
              <option value="">All mats</option>
              {mats.map((mat) => (
                <option key={mat.id} value={mat.id}>
                  {mat.name}
                </option>
              ))}
            </select>
            <select name="school" defaultValue={params.school ?? ''} className="select" aria-label="School">
              <option value="">All schools</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.code} — {school.name}
                </option>
              ))}
            </select>
            <select name="cat" defaultValue={params.cat ?? ''} className="select" aria-label="Age category">
              <option value="">All age categories</option>
              <option value="YOUTH">Youth</option>
              <option value="CADET">Cadet</option>
              <option value="JUNIOR">Junior</option>
            </select>
            <button type="submit" className="btn-dark">
              Filter
            </button>
          </form>
        </Card>
        )}

        {bouts.length === 0 ? (
          <Empty
            title="No scheduled bouts yet"
            hint="Once the organising team publishes the draws and assigns mats, the full running order appears here."
          />
        ) : (
          [...byDay.entries()].map(([day, dayBouts]) => (
            <Card key={day} title={day} subtitle={`${dayBouts.length} bout${dayBouts.length === 1 ? '' : 's'}`} bodyClassName="">
              <TableWrap>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>#</th>
                      <th>Mat</th>
                      <th>Division</th>
                      <th>Round</th>
                      <th>Red corner</th>
                      <th>Blue corner</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {dayBouts.map((bout) => (
                      <tr key={bout.id}>
                        <td className="num whitespace-nowrap">{bout.scheduledAt ? fmtTime(bout.scheduledAt) : 'TBC'}</td>
                        <td className="num text-ink-muted">{bout.boutNumber || '—'}</td>
                        <td className="whitespace-nowrap">{bout.mat?.name ?? '—'}</td>
                        <td className="text-ink">{bout.category.name}</td>
                        <td className="whitespace-nowrap text-xs">{bout.roundLabel}</td>
                        <td className="whitespace-nowrap">
                          <span className="text-tkd-red">{bout.redEntry?.participant.name ?? 'TBD'}</span>
                          <span className="ml-1.5 text-xs text-ink-muted">
                            {bout.redEntry?.participant.school.code ?? ''}
                          </span>
                        </td>
                        <td className="whitespace-nowrap">
                          <span className="text-tkd-blue">{bout.blueEntry?.participant.name ?? 'TBD'}</span>
                          <span className="ml-1.5 text-xs text-ink-muted">
                            {bout.blueEntry?.participant.school.code ?? ''}
                          </span>
                        </td>
                        <td>
                          <StatusBadge status={bout.status} />
                        </td>
                        <td className="text-right">
                          <Link href={eventPath(slug, `results/${bout.category.id}`)} className="btn-quiet btn-sm">
                            Bracket
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
