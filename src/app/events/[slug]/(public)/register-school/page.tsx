import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RegisterSchoolForm } from './RegisterSchoolForm';
import { currentUser, homeFor } from '@/lib/auth';
import { getEventBySlug } from '@/lib/db';
import { fmtDate } from '@/lib/format';
import { Notice } from '@/components/ui';
import { eventLoginPath, eventPath, registerSchoolPath } from '@/lib/paths';
import { logoutAction } from '@/actions/auth';

export const metadata = { title: 'Register your school' };

export default async function RegisterSchoolPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await currentUser();
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) notFound();

  // Anyone already signed in used to be bounced silently to their own home,
  // which made the "Register your school" button look broken — the organiser
  // pressed it and simply landed back on the events list. Explain instead, and
  // say what to do next.
  if (session) {
    const alreadyInThisEvent = session.eventId === event.id;

    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Register your school</h1>

        <div className="mt-6">
          <Notice kind="info">
            {session.role === 'SUPER_ADMIN' ? (
              <>
                <strong>You are signed in as the organiser.</strong> This form creates a school
                login, so it is meant for coaches. To enter a school yourself — a walk-in or a phone
                entry — use <strong>Add a school</strong> on the event&apos;s Schools page.
              </>
            ) : alreadyInThisEvent ? (
              <>
                <strong>You already have an account for {event.eventName}.</strong> Open your
                dashboard to manage entries, or sign out to register a different school.
              </>
            ) : (
              <>
                <strong>You are signed in for a different event.</strong> Each event keeps its own
                accounts, so registering here needs you to sign out first — your other account is
                not affected.
              </>
            )}
          </Notice>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Link href={homeFor(session)} className="btn-primary btn-sm">
            {session.role === 'SUPER_ADMIN' ? 'Go to the organiser console' : 'Open my dashboard'}
          </Link>
          <form action={logoutAction}>
            <input type="hidden" name="next" value={registerSchoolPath(slug)} />
            <button type="submit" className="btn-ghost btn-sm">
              Sign out and register a school
            </button>
          </form>
          <Link href={eventPath(slug)} className="btn-quiet btn-sm">
            Back to {event.eventName}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Register your school</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
        One account per school. You will be able to enter participants straight away — the organising
        team approves the account before accreditation cards are released.
      </p>

      {event.registrationLocked ? (
        <div className="mt-6">
          <Notice kind="warn">
            Registration for the {event.edition} edition is closed. Contact the organising team if
            you need a late entry.
          </Notice>
        </div>
      ) : (
        <p className="mt-4 text-xs text-ink-muted">
          Entries close <strong className="text-ink-soft">{fmtDate(event.registrationClosesAt)}</strong>.
          Entry fee is ₹{event.feePerParticipant} per participant.
        </p>
      )}

      <div className="mt-8">
        <RegisterSchoolForm eventId={event.id} disabled={event.registrationLocked} />
      </div>

      <p className="mt-6 text-sm text-ink-soft">
        Already registered?{' '}
        <Link href={eventLoginPath(slug)} className="font-medium text-tkd-red hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
