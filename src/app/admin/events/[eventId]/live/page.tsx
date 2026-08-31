import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { db, getEventById } from '@/lib/db';
import { clearDispute } from '@/actions/admin';
import { Card, Empty, Notice, PageHeader, Stat, StatusBadge, TableWrap } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { fmtDateTime, fmtTime } from '@/lib/format';
import { OverridePanel } from './OverridePanel';
import { LiveRefresher } from './LiveRefresher';
import { adminPath, eventPath } from '@/lib/paths';
import { EventIdField } from '@/components/EventIdField';

export const metadata = { title: 'Live control' };
export const dynamic = 'force-dynamic';

export default async function AdminLivePage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ bout?: string; mat?: string }>;
}) {
  await requireAdmin();
  const [{ eventId }, params] = await Promise.all([routeParams, searchParams]);
  const event = await getEventById(eventId);
  if (!event) notFound();

  const [mats, disputes, inProgress, upcoming, unscheduled, poomsaePending, selected] = await Promise.all([
    db.mat.findMany({
      where: { eventId, active: true },
      include: {
        bouts: {
          where: { status: { in: ['SCHEDULED', 'IN_PROGRESS'] } },
          include: {
            category: { select: { name: true } },
            redEntry: { include: { participant: { include: { school: { select: { code: true } } } } } },
            blueEntry: { include: { participant: { include: { school: { select: { code: true } } } } } },
          },
          orderBy: [{ scheduledAt: 'asc' }, { round: 'asc' }, { position: 'asc' }],
          take: 4,
        },
      },
      orderBy: { sortOrder: 'asc' },
    }),
    db.bout.findMany({
      where: { category: { eventId }, disputeFlag: true },
      include: {
        category: { select: { id: true, name: true } },
        mat: { select: { name: true } },
        referee: { select: { name: true } },
        redEntry: { include: { participant: true } },
        blueEntry: { include: { participant: true } },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    db.bout.count({ where: { category: { eventId }, status: 'IN_PROGRESS' } }),
    db.bout.count({ where: { category: { eventId }, status: 'SCHEDULED' } }),
    db.bout.count({ where: { category: { eventId }, status: 'SCHEDULED', matId: null } }),
    db.category.findMany({
      where: { eventId, discipline: 'POOMSAE', finalized: false, entries: { some: { poomsaeScores: { some: {} } } } },
      include: { _count: { select: { entries: true } } },
      orderBy: { sortOrder: 'asc' },
    }),
    params.bout
      ? db.bout.findFirst({
          where: { category: { eventId }, id: params.bout },
          include: {
            category: { select: { name: true } },
            redEntry: { include: { participant: { include: { school: { select: { code: true } } } } } },
            blueEntry: { include: { participant: { include: { school: { select: { code: true } } } } } },
          },
        })
      : Promise.resolve(null),
  ]);

  const completed = await db.bout.count({ where: { category: { eventId }, status: 'COMPLETED' } });

  return (
    <>
      <PageHeader
        title="Live control"
        subtitle="What is happening on every mat right now, plus the overrides the Technical Director needs — walkovers, corrections and dispute review."
        actions={
          <>
            <LiveRefresher />
            <Link href={eventPath(event.slug, 'results')} className="btn-ghost" target="_blank">
              Public results
            </Link>
          </>
        }
      />

      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="In progress" value={inProgress} />
          <Stat label="Waiting" value={upcoming} />
          <Stat label="Completed" value={completed} />
          <Stat label="Flagged for review" value={disputes.length} />
        </div>

        {unscheduled > 0 && (
          <Notice kind="info">
            {unscheduled} bout{unscheduled === 1 ? ' is' : 's are'} ready but not yet assigned a mat or
            time — that&apos;s why the mats below look empty.{' '}
            <Link href={adminPath(eventId, 'schedule')} className="font-medium underline">
              Go to Schedule &amp; mats
            </Link>{' '}
            to assign them.
          </Notice>
        )}

        {disputes.length > 0 && (
          <Card
            title="Flagged for the Technical Director"
            subtitle="A mat official raised a review on these bouts."
            bodyClassName=""
          >
            <ul className="divide-y divide-surface-line">
              {disputes.map((bout) => (
                <li key={bout.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {bout.category.name} · {bout.roundLabel}
                        {bout.boutNumber ? ` · bout #${bout.boutNumber}` : ''}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {bout.mat?.name ?? 'No mat'} · referee {bout.referee?.name ?? 'unassigned'} ·{' '}
                        <span className="text-tkd-red">{bout.redEntry?.participant.name ?? 'TBD'}</span> vs{' '}
                        <span className="text-tkd-blue">{bout.blueEntry?.participant.name ?? 'TBD'}</span>
                      </p>
                      {bout.disputeNote && (
                        <p className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                          {bout.disputeNote}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Link href={adminPath(eventId, `live?bout=${bout.id}`)} className="btn-ghost btn-sm">
                        Override result
                      </Link>
                      <form action={clearDispute}>
                        <EventIdField />
                        <input type="hidden" name="boutId" value={bout.id} />
                        <SubmitButton className="btn-quiet btn-sm" pendingLabel="…">
                          Clear flag
                        </SubmitButton>
                      </form>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {selected && (
          <Card
            title={`Override — ${selected.category.name} ${selected.roundLabel}`}
            subtitle="Recording a result here advances the bracket exactly as a mat official's submission would."
            actions={
              <Link href={adminPath(eventId, 'live')} className="btn-quiet btn-sm">
                Close
              </Link>
            }
          >
            <OverridePanel
              boutId={selected.id}
              red={selected.redEntry?.participant.name ?? null}
              blue={selected.blueEntry?.participant.name ?? null}
              redScore={selected.redScore}
              blueScore={selected.blueScore}
              status={selected.status}
            />
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {mats.map((mat) => (
            <Card key={mat.id} title={mat.name} subtitle={`${mat.bouts.length} bout(s) queued`} bodyClassName="">
              {mat.bouts.length === 0 ? (
                <p className="px-5 py-6 text-sm text-ink-muted">Nothing queued on this mat.</p>
              ) : (
                <ul className="divide-y divide-surface-line">
                  {mat.bouts.map((bout, idx) => (
                    <li key={bout.id} className={`px-4 py-3 ${idx === 0 ? 'bg-surface-sunk/50' : ''}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="num text-[11px] text-ink-muted">
                          {bout.boutNumber ? `#${bout.boutNumber}` : '—'}
                          {bout.scheduledAt ? ` · ${fmtTime(bout.scheduledAt)}` : ''}
                        </span>
                        <StatusBadge status={bout.status} />
                      </div>
                      <p className="mt-1 truncate text-xs text-ink-muted">{bout.category.name}</p>
                      <p className="mt-1 text-[13px] leading-snug">
                        <span className="text-tkd-red">{bout.redEntry?.participant.name ?? 'TBD'}</span>
                        <span className="mx-1 text-ink-muted">vs</span>
                        <span className="text-tkd-blue">{bout.blueEntry?.participant.name ?? 'TBD'}</span>
                      </p>
                      <Link href={adminPath(eventId, `live?bout=${bout.id}`)} className="btn-quiet btn-sm mt-1.5 !px-0">
                        Override →
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>

        {poomsaePending.length > 0 && (
          <Card
            title="Poomsae categories awaiting finalisation"
            subtitle="Judge scores are in. Finalising ranks the field and awards medals."
            bodyClassName=""
          >
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Entries</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {poomsaePending.map((category) => (
                    <tr key={category.id}>
                      <td className="font-medium text-ink">{category.name}</td>
                      <td className="num">{category._count.entries}</td>
                      <td className="text-right">
                        <Link href={adminPath(eventId, `draws/${category.id}`)} className="btn-ghost btn-sm">
                          Review &amp; finalise
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        )}

        {mats.length === 0 && (
          <Empty
            title="No active mats"
            hint="Activate at least one mat so bouts can be assigned and officials can score."
            action={
              <Link href={adminPath(eventId, 'mats')} className="btn-primary btn-sm">
                Manage mats
              </Link>
            }
          />
        )}
      </div>
    </>
  );
}
