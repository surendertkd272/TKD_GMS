import Link from 'next/link';
import { db } from '@/lib/db';
import { fmtDate } from '@/lib/format';
import { eventPath, ADMIN_LOGIN } from '@/lib/paths';

export const dynamic = 'force-dynamic';

export default async function PlatformHome() {
  const now = new Date();
  const events = await db.event.findMany({
    where: { isPublic: true },
    orderBy: { startDate: 'desc' },
    include: {
      _count: { select: { schools: true } },
    },
  });

  const upcoming = events.filter((e) => e.endDate >= now);
  const past = events.filter((e) => e.endDate < now);

  return (
    <div className="min-h-screen bg-surface-sunk">
      <header className="border-b border-surface-line bg-ink">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <span className="flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-tkd-red text-[13px] font-bold tracking-tight text-white"
              aria-hidden
            >
              태
            </span>
            <span>
              <span className="block text-[13px] font-semibold leading-tight tracking-tight text-white">
                Taekwondo GMS
              </span>
              <span className="block text-[11px] leading-tight text-white/60">Game Management System</span>
            </span>
          </span>
          <Link href={ADMIN_LOGIN} className="text-sm text-white/70 transition-colors hover:text-white">
            Organiser sign in
          </Link>
        </div>
      </header>

      <section className="border-b border-surface-line bg-ink">
        <div className="mx-auto max-w-6xl px-4 pb-14 pt-8 sm:px-6 lg:px-8">
          <h1 className="max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
            Taekwondo championships, run end to end.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/70">
            Registration, accreditation, seeded draws, live Kyorugi and Poomsae scoring, the medal tally and
            digital certificates — one system per event, no paperwork.
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {events.length === 0 ? (
          <div className="rounded-lg border border-dashed border-surface-line bg-white px-6 py-16 text-center">
            <p className="text-sm font-medium text-ink">No events published yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">
              Once the organising team publishes a championship it will be listed here, with entries, draws
              and live results.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {upcoming.length > 0 && <EventGrid title="Upcoming & live" events={upcoming} />}
            {past.length > 0 && <EventGrid title="Past events" events={past} muted />}
          </div>
        )}
      </main>

      <footer className="border-t border-surface-line bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-ink-muted sm:px-6 lg:px-8">
          Taekwondo Game Management System — results update live as bouts are finalised.
        </div>
      </footer>
    </div>
  );
}

type EventCard = {
  id: string;
  slug: string;
  eventName: string;
  edition: string;
  organiser: string;
  venue: string;
  startDate: Date;
  endDate: Date;
  _count: { schools: number };
};

function EventGrid({ title, events, muted }: { title: string; events: EventCard[]; muted?: boolean }) {
  return (
    <section>
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {events.map((event) => (
          <Link
            key={event.id}
            href={eventPath(event.slug)}
            className={`card block p-5 transition-colors hover:border-ink/25 ${muted ? 'opacity-80' : ''}`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              {event.organiser}
            </p>
            <p className="mt-1 text-lg font-semibold leading-snug tracking-tight text-ink">
              {event.eventName}
            </p>
            <p className="mt-0.5 text-sm text-ink-soft">{event.edition}</p>

            <dl className="mt-4 space-y-1.5 border-t border-surface-line pt-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Dates</dt>
                <dd className="text-right text-ink-soft">
                  {fmtDate(event.startDate)} – {fmtDate(event.endDate)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Venue</dt>
                <dd className="truncate text-right text-ink-soft">{event.venue}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Schools</dt>
                <dd className="num text-right text-ink-soft">{event._count.schools}</dd>
              </div>
            </dl>
          </Link>
        ))}
      </div>
    </section>
  );
}
