import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getEventBySlug } from '@/lib/db';
import { currentUser, homeFor } from '@/lib/auth';
import { Brand } from '@/components/Brand';
import { TopLink } from '@/components/NavLink';
import { fmtDate } from '@/lib/format';
import { eventLoginPath, eventPath, registerSchoolPath } from '@/lib/paths';

/** Header, nav and footer for the public-facing event pages only. */
export default async function PublicEventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [event, session] = await Promise.all([getEventBySlug(slug), currentUser()]);
  if (!event) notFound();

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="no-print sticky top-0 z-30 border-b border-surface-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Brand eventName={event.eventName} edition={event.edition} href={eventPath(slug)} />

          <div className="flex items-center gap-2">
            {session ? (
              <Link href={homeFor(session)} className="btn-dark btn-sm">
                My dashboard
              </Link>
            ) : (
              <>
                <Link href={eventLoginPath(slug)} className="btn-ghost btn-sm">
                  Sign in
                </Link>
                <Link href={registerSchoolPath(slug)} className="btn-primary btn-sm">
                  Register a school
                </Link>
              </>
            )}
          </div>
        </div>

        <nav className="mx-auto flex max-w-7xl gap-5 overflow-x-auto px-4 sm:px-6 lg:px-8">
          <TopLink href={eventPath(slug)} exact>
            Event
          </TopLink>
          <TopLink href={eventPath(slug, 'schedule')}>Schedule</TopLink>
          <TopLink href={eventPath(slug, 'results')}>Results &amp; draws</TopLink>
          <TopLink href={eventPath(slug, 'medal-tally')}>Medal tally</TopLink>
          <TopLink href={eventPath(slug, 'gallery')}>Gallery</TopLink>
          <TopLink href={eventPath(slug, 'verify')}>Verify a certificate</TopLink>
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="no-print border-t border-surface-line bg-surface-sunk">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-sm font-semibold text-ink">{event.eventName}</p>
              <p className="mt-1 text-sm text-ink-muted">
                {event.organiser} · {event.venue}
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                {fmtDate(event.startDate)} – {fmtDate(event.endDate)}
              </p>
            </div>
            <div className="text-sm text-ink-muted">
              <p>
                Schools:{' '}
                <Link href={eventLoginPath(slug)} className="font-medium text-ink-soft hover:text-tkd-red">
                  sign in
                </Link>{' '}
                to manage entries.
              </p>
              <p className="mt-1">
                Officials:{' '}
                <Link href={eventLoginPath(slug)} className="font-medium text-ink-soft hover:text-tkd-red">
                  mat-side scoring panel
                </Link>
                .
              </p>
              <p className="mt-3">
                <Link href="/" className="font-medium text-ink-soft hover:text-tkd-red">
                  ← All events
                </Link>
              </p>
            </div>
          </div>
          <p className="mt-6 border-t border-surface-line pt-4 text-xs text-ink-muted">
            Taekwondo Game Management System · results shown here update live as bouts are finalised.
          </p>
        </div>
      </footer>
    </div>
  );
}
