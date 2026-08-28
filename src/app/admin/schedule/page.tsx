import { requireAdmin } from '@/lib/auth';
import { db, getSettings } from '@/lib/db';
import { detectScheduleConflicts } from '@/lib/tournament';
import { Card, Empty, Notice, PageHeader, Stat, StatusBadge, TableWrap } from '@/components/ui';
import { fmtDateTime, toDateTimeInput } from '@/lib/format';
import { AutoScheduleForm } from './AutoScheduleForm';
import { BoutScheduleRow } from './BoutScheduleRow';

export const metadata = { title: 'Schedule & mats' };
export const dynamic = 'force-dynamic';

export default async function AdminSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ mat?: string; status?: string; category?: string }>;
}) {
  await requireAdmin();
  const [settings, params] = await Promise.all([getSettings(), searchParams]);

  const [bouts, mats, referees, conflicts, categories] = await Promise.all([
    db.bout.findMany({
      where: {
        status: { not: 'BYE' },
        ...(params.mat ? { matId: params.mat } : {}),
        ...(params.status ? { status: params.status } : {}),
        ...(params.category ? { categoryId: params.category } : {}),
      },
      include: {
        category: { select: { id: true, name: true, event: true } },
        mat: { select: { id: true, name: true } },
        referee: { select: { id: true, name: true } },
        redEntry: { include: { participant: { include: { school: { select: { code: true } } } } } },
        blueEntry: { include: { participant: { include: { school: { select: { code: true } } } } } },
      },
      orderBy: [{ scheduledAt: 'asc' }, { round: 'asc' }, { position: 'asc' }],
      take: 300,
    }),
    db.mat.findMany({ orderBy: { sortOrder: 'asc' } }),
    db.user.findMany({ where: { role: 'REFEREE', active: true }, orderBy: { name: 'asc' } }),
    detectScheduleConflicts(),
    db.category.findMany({
      where: { bouts: { some: {} } },
      select: { id: true, name: true },
      orderBy: { sortOrder: 'asc' },
    }),
  ]);

  const conflictBoutIds = new Set(conflicts.flatMap((c) => c.boutIds));
  const unscheduled = bouts.filter((b) => !b.scheduledAt).length;

  return (
    <>
      <PageHeader
        title="Schedule & mats"
        subtitle="Assign every bout to a mat and time slot. Conflicts — an athlete needed on two mats at once, a double-booked mat or referee, a bout before its feeder — are flagged automatically."
      />

      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Bouts" value={bouts.length} />
          <Stat label="Unscheduled" value={unscheduled} />
          <Stat label="Active mats" value={mats.filter((m) => m.active).length} />
          <Stat label="Conflicts" value={conflicts.length} hint={conflicts.length ? 'Resolve before the event' : 'All clear'} />
        </div>

        {conflicts.length > 0 && (
          <Card title={`${conflicts.length} scheduling conflict${conflicts.length === 1 ? '' : 's'}`} bodyClassName="">
            <ul className="divide-y divide-surface-line">
              {conflicts.slice(0, 12).map((conflict, i) => (
                <li key={`${conflict.kind}-${i}`} className="flex items-start gap-3 px-5 py-3">
                  <span className="badge-red shrink-0">{conflict.kind.replace(/_/g, ' ').toLowerCase()}</span>
                  <span className="text-sm text-ink-soft">{conflict.message}</span>
                </li>
              ))}
            </ul>
            {conflicts.length > 12 && (
              <p className="px-5 py-3 text-xs text-ink-muted">and {conflicts.length - 12} more…</p>
            )}
          </Card>
        )}

        <AutoScheduleForm defaultStart={toDateTimeInput(settings.startDate)} />

        <Card bodyClassName="card-pad">
          <form className="grid gap-3 sm:grid-cols-[auto_auto_1fr_auto]">
            <select name="mat" defaultValue={params.mat ?? ''} className="select">
              <option value="">All mats</option>
              {mats.map((mat) => (
                <option key={mat.id} value={mat.id}>
                  {mat.name}
                </option>
              ))}
            </select>
            <select name="status" defaultValue={params.status ?? ''} className="select">
              <option value="">Any status</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="COMPLETED">Completed</option>
            </select>
            <select name="category" defaultValue={params.category ?? ''} className="select">
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <button type="submit" className="btn-dark">
              Filter
            </button>
          </form>
        </Card>

        {bouts.length === 0 ? (
          <Empty
            title="No bouts to schedule"
            hint="Generate the draws first — every bracket bout then appears here for mat and time assignment."
          />
        ) : (
          <Card
            title="Bout schedule"
            subtitle="Changes save per row. Auto-assign first, then adjust the rows that need it."
            bodyClassName=""
          >
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Category / round</th>
                    <th>Red</th>
                    <th>Blue</th>
                    <th>Mat</th>
                    <th>Time</th>
                    <th>Referee</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {bouts.map((bout) => (
                    <BoutScheduleRow
                      key={bout.id}
                      bout={{
                        id: bout.id,
                        boutNumber: bout.boutNumber,
                        categoryName: bout.category.name,
                        roundLabel: bout.roundLabel,
                        red: bout.redEntry
                          ? `${bout.redEntry.participant.name} (${bout.redEntry.participant.school.code})`
                          : 'TBD',
                        blue: bout.blueEntry
                          ? `${bout.blueEntry.participant.name} (${bout.blueEntry.participant.school.code})`
                          : 'TBD',
                        matId: bout.matId,
                        scheduledAt: toDateTimeInput(bout.scheduledAt),
                        refereeId: bout.refereeId,
                        status: bout.status,
                        conflicted: conflictBoutIds.has(bout.id),
                      }}
                      mats={mats.map((m) => ({ id: m.id, name: m.name, active: m.active }))}
                      referees={referees.map((r) => ({ id: r.id, name: r.name }))}
                    />
                  ))}
                </tbody>
              </table>
            </TableWrap>
            {bouts.length === 300 && (
              <p className="px-5 py-3 text-xs text-ink-muted">Showing the first 300 — narrow the filters to see more.</p>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
