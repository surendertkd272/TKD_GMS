import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { db, getEventById } from '@/lib/db';
import { fmtTime } from '@/lib/format';
import { adminPath } from '@/lib/paths';
import { LiveRefresher } from '../(console)/live/LiveRefresher';

export const metadata = { title: 'Mat display' };
export const dynamic = 'force-dynamic';

/**
 * The control desk usually puts live control on a second monitor or a projector,
 * where the ordinary admin page is unreadable from across the hall. This is the
 * same data with the chrome stripped out and the type scaled up: no sidebar,
 * dark ground, one panel per mat.
 */
export default async function MatDisplayPage({ params }: { params: Promise<{ eventId: string }> }) {
  await requireAdmin();
  const { eventId } = await params;
  const event = await getEventById(eventId);
  if (!event) notFound();

  const mats = await db.mat.findMany({
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
        take: 3,
      },
    },
    orderBy: { sortOrder: 'asc' },
  });

  return (
    <div className="min-h-screen bg-ink text-white">
      <header className="flex flex-wrap items-baseline justify-between gap-4 border-b border-white/10 px-8 py-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{event.eventName}</h1>
          <p className="mt-0.5 text-sm text-white/50">
            {event.venue} · live mat order
          </p>
        </div>
        <div className="flex items-center gap-5 text-sm text-white/50">
          <LiveRefresher />
          <Link href={adminPath(eventId, 'live')} className="text-white/60 underline hover:text-white">
            Exit display
          </Link>
        </div>
      </header>

      <main className="grid gap-5 p-8 sm:grid-cols-2 xl:grid-cols-4">
        {mats.map((mat) => {
          const [current, ...queued] = mat.bouts;
          return (
            <section key={mat.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-xl font-semibold tracking-tight">{mat.name}</h2>
                <span className="text-sm text-white/40">
                  {mat.bouts.length} queued
                </span>
              </div>

              {!current ? (
                <p className="mt-8 text-lg text-white/30">Nothing queued</p>
              ) : (
                <>
                  <p className="mt-5 text-sm uppercase tracking-[0.14em] text-white/40">
                    {current.status === 'IN_PROGRESS' ? 'On the mat' : 'Next up'}
                  </p>
                  <p className="mt-1.5 text-base text-white/60">{current.category.name}</p>

                  <div className="mt-4 space-y-2.5">
                    <div className="rounded-lg bg-tkd-red/20 px-4 py-3">
                      <p className="text-2xl font-semibold leading-tight">
                        {current.redEntry?.participant.name ?? 'TBD'}
                      </p>
                      <p className="text-sm text-white/50">
                        {current.redEntry?.participant.school.code ?? ''}
                      </p>
                    </div>
                    <div className="rounded-lg bg-tkd-blue/30 px-4 py-3">
                      <p className="text-2xl font-semibold leading-tight">
                        {current.blueEntry?.participant.name ?? 'TBD'}
                      </p>
                      <p className="text-sm text-white/50">
                        {current.blueEntry?.participant.school.code ?? ''}
                      </p>
                    </div>
                  </div>

                  {queued.length > 0 && (
                    <ul className="mt-5 space-y-1.5 border-t border-white/10 pt-4 text-base text-white/45">
                      {queued.map((bout) => (
                        <li key={bout.id} className="flex justify-between gap-3">
                          <span className="truncate">
                            {bout.redEntry?.participant.name ?? 'TBD'} v{' '}
                            {bout.blueEntry?.participant.name ?? 'TBD'}
                          </span>
                          <span className="shrink-0 tabular-nums text-white/30">
                            {bout.scheduledAt ? fmtTime(bout.scheduledAt) : '—'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>
          );
        })}
      </main>
    </div>
  );
}
