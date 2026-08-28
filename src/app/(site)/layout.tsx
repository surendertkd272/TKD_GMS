import Link from 'next/link';
import { getSettings } from '@/lib/db';
import { currentUser, homeFor } from '@/lib/auth';
import { Brand } from '@/components/Brand';
import { TopLink } from '@/components/NavLink';
import { fmtDate } from '@/lib/format';

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [settings, session] = await Promise.all([getSettings(), currentUser()]);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="sticky top-0 z-30 border-b border-surface-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Brand eventName={settings.eventName} edition={settings.edition} />

          <div className="flex items-center gap-2">
            {session ? (
              <Link href={homeFor(session.role)} className="btn-dark btn-sm">
                My dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn-ghost btn-sm">
                  Sign in
                </Link>
                <Link href="/register-school" className="btn-primary btn-sm">
                  Register a school
                </Link>
              </>
            )}
          </div>
        </div>

        <nav className="mx-auto flex max-w-7xl gap-5 overflow-x-auto px-4 sm:px-6 lg:px-8">
          <TopLink href="/" exact>
            Event
          </TopLink>
          <TopLink href="/schedule">Schedule</TopLink>
          <TopLink href="/results">Results &amp; draws</TopLink>
          <TopLink href="/medal-tally">Medal tally</TopLink>
          <TopLink href="/gallery">Gallery</TopLink>
          <TopLink href="/verify">Verify a certificate</TopLink>
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-surface-line bg-surface-sunk">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-sm font-semibold text-ink">{settings.eventName}</p>
              <p className="mt-1 text-sm text-ink-muted">
                {settings.organiser} · {settings.venue}
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                {fmtDate(settings.startDate)} – {fmtDate(settings.endDate)}
              </p>
            </div>
            <div className="text-sm text-ink-muted">
              <p>
                Schools:{' '}
                <Link href="/login" className="font-medium text-ink-soft hover:text-tkd-red">
                  sign in
                </Link>{' '}
                to manage entries.
              </p>
              <p className="mt-1">
                Officials:{' '}
                <Link href="/login" className="font-medium text-ink-soft hover:text-tkd-red">
                  mat-side scoring panel
                </Link>
                .
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
