import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { RegisterSchoolForm } from './RegisterSchoolForm';
import { currentUser, homeFor } from '@/lib/auth';
import { getEventBySlug } from '@/lib/db';
import { fmtDate } from '@/lib/format';
import { Notice } from '@/components/ui';
import { eventLoginPath } from '@/lib/paths';

export const metadata = { title: 'Register your school' };

export default async function RegisterSchoolPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await currentUser();
  if (session) redirect(homeFor(session));

  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) notFound();

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
