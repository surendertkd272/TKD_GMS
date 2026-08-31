import Link from 'next/link';
import { requireReferee } from '@/lib/auth';
import { db } from '@/lib/db';
import { startBout } from '@/actions/referee';
import { Card, Empty, Notice, PageHeader, Stat, StatusBadge } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { fmtTime } from '@/lib/format';
import { matPath } from '@/lib/paths';

export const metadata = { title: 'Mat queue' };
export const dynamic = 'force-dynamic';

export default async function MatQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const [{ session, user, event }, params] = await Promise.all([requireReferee(), searchParams]);

  if (!user.assignedMatId) {
    return (
      <>
        <PageHeader title="No mat assigned" subtitle="Ask the organising team to assign you to a mat for today." />
        <Empty
          title="Your scoring panel is scoped to a mat"
          hint="Once a Super Admin assigns you to a mat on the Referees & jury page, the bouts queued on that mat appear here."
          action={
            user.isJury ? (
              <Link href={matPath(event.slug, 'poomsae')} className="btn-primary btn-sm">
                Poomsae judging is still available
              </Link>
            ) : undefined
          }
        />
      </>
    );
  }

  const scope = {
    OR: [{ matId: user.assignedMatId }, { refereeId: session.userId }],
  };

  const [queue, completed, mat] = await Promise.all([
    db.bout.findMany({
      where: { ...scope, status: { in: ['SCHEDULED', 'IN_PROGRESS'] } },
      include: {
        category: { select: { name: true, event: true } },
        redEntry: { include: { participant: { include: { school: { select: { code: true } } } } } },
        blueEntry: { include: { participant: { include: { school: { select: { code: true } } } } } },
      },
      orderBy: [{ status: 'desc' }, { scheduledAt: 'asc' }, { round: 'asc' }, { position: 'asc' }],
      take: 25,
    }),
    db.bout.findMany({
      where: { ...scope, status: 'COMPLETED' },
      include: {
        category: { select: { name: true } },
        redEntry: { include: { participant: true } },
        blueEntry: { include: { participant: true } },
      },
      orderBy: { completedAt: 'desc' },
      take: 6,
    }),
    db.mat.findUnique({ where: { id: user.assignedMatId } }),
  ]);

  const live = queue.filter((b) => b.status === 'IN_PROGRESS');
  const next = queue.filter((b) => b.status === 'SCHEDULED');

  return (
    <>
      <PageHeader
        title={mat?.name ?? 'Mat'}
        subtitle={`${session.name}${user.certification ? ` · ${user.certification}` : ''} — you can score every bout queued on this mat.`}
      />

      <div className="space-y-6">
        {params.submitted && <Notice kind="ok">{params.submitted}</Notice>}

        {/* Three short counters: keep them on one row even on a phone — this panel
            is read at the mat, where vertical space is what matters. */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Stat label="In progress" value={live.length} />
          <Stat label="Waiting" value={next.length} />
          <Stat label="Completed by you" value={completed.length} />
        </div>

        {queue.length === 0 ? (
          <Empty
            title="Nothing queued on this mat"
            hint="Bouts appear the moment the organising team assigns them to this mat. The queue refreshes on every page load."
          />
        ) : (
          <div className="space-y-4">
            {queue.map((bout, idx) => {
              const isLive = bout.status === 'IN_PROGRESS';
              const isNext = !isLive && idx === live.length;

              return (
                <Card
                  key={bout.id}
                  className={isLive ? 'ring-2 ring-amber-300' : isNext ? 'ring-1 ring-ink/15' : ''}
                  bodyClassName="card-pad"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="num text-xs text-ink-muted">
                          {bout.boutNumber ? `Bout #${bout.boutNumber}` : 'Unnumbered'}
                        </span>
                        <StatusBadge status={bout.status} />
                        {isNext && <span className="badge-blue">Up next</span>}
                        {bout.scheduledAt && (
                          <span className="text-xs text-ink-muted">{fmtTime(bout.scheduledAt)}</span>
                        )}
                      </div>
                      <p className="mt-1.5 text-sm font-medium text-ink">
                        {bout.category.name} · {bout.roundLabel}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      {isLive ? (
                        <Link href={matPath(event.slug, `bout/${bout.id}`)} className="btn-primary">
                          Score this bout
                        </Link>
                      ) : (
                        <form action={startBout}>
                          <input type="hidden" name="boutId" value={bout.id} />
                          <SubmitButton className="btn-dark" pendingLabel="Starting…">
                            Start bout
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {(
                      [
                        { side: 'RED', entry: bout.redEntry, bar: 'bg-tkd-red', tint: 'bg-tkd-red/[0.04]' },
                        { side: 'BLUE', entry: bout.blueEntry, bar: 'bg-tkd-blue', tint: 'bg-tkd-blue/[0.04]' },
                      ] as const
                    ).map((corner) => (
                      <div
                        key={corner.side}
                        className={`flex items-center gap-3 rounded-lg border border-surface-line p-3.5 ${corner.tint}`}
                      >
                        <span className={`h-10 w-1 shrink-0 rounded-full ${corner.bar}`} aria-hidden />
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                            {corner.side} corner
                          </p>
                          <p className="truncate text-base font-semibold leading-tight text-ink">
                            {corner.entry?.participant.name ?? 'To be decided'}
                          </p>
                          <p className="truncate text-xs text-ink-muted">
                            {corner.entry
                              ? `${corner.entry.participant.school.code} · ${corner.entry.participant.weightKg} kg · ${corner.entry.participant.beltGrade}`
                              : 'Waiting on an earlier bout'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {completed.length > 0 && (
          <Card title="Recently completed on this mat" bodyClassName="">
            <ul className="divide-y divide-surface-line">
              {completed.map((bout) => {
                const winner =
                  bout.winnerEntryId === bout.redEntryId
                    ? bout.redEntry?.participant.name
                    : bout.blueEntry?.participant.name;
                return (
                  <li key={bout.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink">
                        <span className="font-medium">{winner ?? '—'}</span>{' '}
                        <span className="text-ink-muted">won {bout.roundLabel.toLowerCase()}</span>
                      </p>
                      <p className="truncate text-xs text-ink-muted">{bout.category.name}</p>
                    </div>
                    <span className="num shrink-0 text-sm font-semibold text-ink">
                      {bout.redScore}–{bout.blueScore}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
