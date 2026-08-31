import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { db, getEventById } from '@/lib/db';
import { championSchool, eventStats, medalTally } from '@/lib/medals';
import { detectScheduleConflicts } from '@/lib/tournament';
import { Card, Empty, MedalPips, Notice, PageHeader, Stat, StatusBadge, TableWrap } from '@/components/ui';
import { fmtDate, fmtDateTime, money } from '@/lib/format';
import { adminPath } from '@/lib/paths';

export const metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

export default async function AdminDashboard({ params }: { params: Promise<{ eventId: string }> }) {
  await requireAdmin();
  const { eventId } = await params;
  const event = await getEventById(eventId);
  if (!event) notFound();

  const [stats, tally, champion, conflicts] = await Promise.all([
    eventStats(eventId),
    medalTally(eventId, event),
    championSchool(eventId, event),
    detectScheduleConflicts(eventId),
  ]);

  const [pendingSchools, unmatchedAthletes, disputes, recentBouts, drawState, unsentCertificates] = await Promise.all([
    db.school.findMany({
      where: { eventId, status: 'PENDING' },
      include: { _count: { select: { participants: true } } },
      orderBy: { submittedAt: 'asc' },
      take: 6,
    }),
    db.participant.count({ where: { school: { eventId }, personRole: 'ATHLETE', entries: { none: {} } } }),
    db.bout.count({ where: { disputeFlag: true, category: { eventId } } }),
    db.bout.findMany({
      where: { status: 'COMPLETED', category: { eventId } },
      include: {
        category: true,
        mat: true,
        redEntry: { include: { participant: true } },
        blueEntry: { include: { participant: true } },
      },
      orderBy: { completedAt: 'desc' },
      take: 6,
    }),
    db.category.groupBy({ by: ['drawStatus'], where: { eventId, active: true }, _count: true }),
    db.certificate.count({ where: { participant: { school: { eventId } }, emailedAt: null, revoked: false } }),
  ]);

  const drawCounts = Object.fromEntries(drawState.map((d) => [d.drawStatus, d._count]));
  const progress = stats.bouts ? Math.round((stats.completedBouts / stats.bouts) * 100) : 0;

  return (
    <>
      <PageHeader
        title="Championship control"
        subtitle={`${event.eventName} ${event.edition} · ${event.venue} · ${fmtDate(event.startDate)} – ${fmtDate(event.endDate)}`}
        actions={
          <>
            <Link href={adminPath(eventId, 'draws')} className="btn-ghost">
              Draws
            </Link>
            <Link href={adminPath(eventId, 'live')} className="btn-primary">
              Live control
            </Link>
          </>
        }
      />

      <div className="space-y-6">
        {(pendingSchools.length > 0 || conflicts.length > 0 || disputes > 0 || unmatchedAthletes > 0) && (
          <div className="grid gap-3 md:grid-cols-2">
            {pendingSchools.length > 0 && (
              <Notice kind="warn">
                <strong>{pendingSchools.length} school registration{pendingSchools.length === 1 ? '' : 's'} awaiting approval.</strong>{' '}
                Accreditation cards stay locked until you approve them.{' '}
                <Link href={adminPath(eventId, 'schools?status=PENDING')} className="font-medium underline">
                  Review now
                </Link>
              </Notice>
            )}
            {conflicts.length > 0 && (
              <Notice kind="error">
                <strong>{conflicts.length} scheduling conflict{conflicts.length === 1 ? '' : 's'}.</strong>{' '}
                {conflicts[0]!.message}{' '}
                <Link href={adminPath(eventId, 'schedule')} className="font-medium underline">
                  Resolve
                </Link>
              </Notice>
            )}
            {disputes > 0 && (
              <Notice kind="error">
                <strong>{disputes} bout{disputes === 1 ? '' : 's'} flagged for review</strong> by a mat
                official.{' '}
                <Link href={adminPath(eventId, 'live')} className="font-medium underline">
                  Open live control
                </Link>
              </Notice>
            )}
            {unmatchedAthletes > 0 && (
              <Notice kind="warn">
                <strong>{unmatchedAthletes} athlete{unmatchedAthletes === 1 ? '' : 's'} matched no division</strong> — usually a
                weight outside the configured grid.{' '}
                <Link href="/admin/participants?unmatched=1" className="font-medium underline">
                  Inspect
                </Link>
              </Notice>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Schools" value={stats.schools} hint={`${stats.approvedSchools} approved`} />
          <Stat label="Participants" value={stats.participants} hint={`${stats.athletes} athletes`} />
          <Stat label="Bouts" value={`${stats.completedBouts}/${stats.bouts}`} hint={`${progress}% complete`} />
          <Stat label="Entry fees" value={money(stats.revenue)} hint="Received to date" />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card
              title="Event progress"
              subtitle="Each stage unlocks the next — registration, accreditation, draws, scoring, certificates."
              bodyClassName="card-pad"
            >
              <ol className="space-y-4">
                {[
                  {
                    label: 'Registration',
                    done: stats.approvedSchools > 0,
                    detail: `${stats.approvedSchools} of ${stats.schools} schools approved · ${stats.approvedParticipants} participants accredited`,
                    href: '/admin/schools',
                  },
                  {
                    label: 'Draws generated',
                    done: (drawCounts.GENERATED ?? 0) + (drawCounts.PUBLISHED ?? 0) + (drawCounts.LOCKED ?? 0) > 0,
                    detail: `${drawCounts.GENERATED ?? 0} generated · ${drawCounts.PUBLISHED ?? 0} published · ${drawCounts.LOCKED ?? 0} locked · ${drawCounts.DRAFT ?? 0} draft`,
                    href: '/admin/draws',
                  },
                  {
                    label: 'Schedule assigned',
                    done: stats.bouts > 0 && conflicts.length === 0,
                    detail:
                      stats.bouts === 0
                        ? 'No bouts yet'
                        : `${stats.bouts} bouts across the mats${conflicts.length ? ` · ${conflicts.length} conflict(s)` : ' · no conflicts'}`,
                    href: '/admin/schedule',
                  },
                  {
                    label: 'Scoring',
                    done: stats.bouts > 0 && stats.completedBouts === stats.bouts,
                    detail: `${stats.completedBouts} of ${stats.bouts} bouts complete · ${stats.medals} medals awarded`,
                    href: '/admin/live',
                  },
                  {
                    label: 'Certificates',
                    done: stats.certificates > 0 && unsentCertificates === 0,
                    detail:
                      stats.certificates === 0
                        ? 'None issued yet'
                        : `${stats.certificates} issued · ${unsentCertificates} awaiting email`,
                    href: '/admin/certificates',
                  },
                ].map((step) => (
                  <li key={step.label} className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                        step.done ? 'bg-emerald-100 text-emerald-700' : 'bg-surface-sunk text-ink-muted'
                      }`}
                    >
                      {step.done ? '✓' : '·'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <Link href={step.href} className="text-sm font-medium text-ink hover:text-tkd-red">
                        {step.label}
                      </Link>
                      <span className="block text-xs leading-relaxed text-ink-muted">{step.detail}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </Card>

            <Card
              title="Latest results"
              subtitle="Every completed bout, newest first."
              actions={
                <Link href={adminPath(eventId, 'live')} className="btn-ghost btn-sm">
                  Live control
                </Link>
              }
              bodyClassName=""
            >
              {recentBouts.length === 0 ? (
                <div className="card-pad">
                  <Empty title="No bouts completed yet" hint="Results land here the moment a mat official submits them." />
                </div>
              ) : (
                <TableWrap>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Category</th>
                        <th>Round</th>
                        <th>Winner</th>
                        <th>Score</th>
                        <th>Mat</th>
                        <th>Completed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentBouts.map((bout) => {
                        const winner =
                          bout.winnerEntryId === bout.redEntryId
                            ? bout.redEntry?.participant.name
                            : bout.blueEntry?.participant.name;
                        return (
                          <tr key={bout.id}>
                            <td className="num text-ink-muted">{bout.boutNumber || '—'}</td>
                            <td className="text-ink">{bout.category.name}</td>
                            <td className="whitespace-nowrap">{bout.roundLabel}</td>
                            <td className="font-medium text-ink">{winner ?? '—'}</td>
                            <td className="num">
                              {bout.redScore}–{bout.blueScore}
                            </td>
                            <td>{bout.mat?.name ?? '—'}</td>
                            <td className="whitespace-nowrap text-xs text-ink-muted">
                              {fmtDateTime(bout.completedAt)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </Card>
          </div>

          <div className="space-y-6">
            <Card
              title="Champion school"
              subtitle={`Gold ${event.pointsGold} · Silver ${event.pointsSilver} · Bronze ${event.pointsBronze}`}
              bodyClassName="card-pad"
            >
              {!champion ? (
                <p className="text-sm text-ink-muted">No medals awarded yet.</p>
              ) : (
                <>
                  <p className="text-lg font-semibold tracking-tight text-ink">{champion.schoolName}</p>
                  <p className="mt-1 text-sm text-ink-muted">
                    {champion.points} points from {champion.total} medal{champion.total === 1 ? '' : 's'}
                  </p>
                  <div className="mt-3">
                    <MedalPips gold={champion.gold} silver={champion.silver} bronze={champion.bronze} />
                  </div>
                  <Link href="/medal-tally" className="btn-ghost btn-sm mt-4">
                    Full tally
                  </Link>
                </>
              )}
            </Card>

            <Card title="Awaiting approval" bodyClassName="">
              {pendingSchools.length === 0 ? (
                <div className="card-pad text-sm text-ink-muted">Nothing pending — every school is reviewed.</div>
              ) : (
                <ul className="divide-y divide-surface-line">
                  {pendingSchools.map((school) => (
                    <li key={school.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <Link href={adminPath(eventId, `schools/${school.id}`)} className="block truncate text-sm font-medium text-ink hover:text-tkd-red">
                          {school.name}
                        </Link>
                        <p className="text-xs text-ink-muted">
                          {school._count.participants} participant{school._count.participants === 1 ? '' : 's'} ·{' '}
                          {school.submittedAt ? fmtDate(school.submittedAt) : 'not submitted'}
                        </p>
                      </div>
                      <StatusBadge status={school.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Medal tally leaders" bodyClassName="">
              {tally.rows.length === 0 ? (
                <div className="card-pad text-sm text-ink-muted">No medals awarded yet.</div>
              ) : (
                <ul className="divide-y divide-surface-line">
                  {tally.rows.slice(0, 6).map((row) => (
                    <li key={row.schoolId} className="flex items-center justify-between gap-3 px-5 py-3">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="num w-5 shrink-0 text-xs text-ink-muted">{row.rank}</span>
                        <span className="truncate text-sm text-ink">{row.schoolName}</span>
                      </span>
                      <MedalPips gold={row.gold} silver={row.silver} bronze={row.bronze} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
