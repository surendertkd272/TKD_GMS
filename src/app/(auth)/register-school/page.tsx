import Link from 'next/link';
import { redirect } from 'next/navigation';
import { RegisterSchoolForm } from './RegisterSchoolForm';
import { currentUser, homeFor } from '@/lib/auth';
import { getSettings } from '@/lib/db';
import { fmtDate } from '@/lib/format';
import { Notice } from '@/components/ui';

export const metadata = { title: 'Register your school' };

export default async function RegisterSchoolPage() {
  const session = await currentUser();
  if (session) redirect(homeFor(session.role));

  const settings = await getSettings();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Register your school</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
        One account per school. You will be able to enter participants straight away — the organising
        team approves the account before accreditation cards are released.
      </p>

      {settings.registrationLocked ? (
        <div className="mt-6">
          <Notice kind="warn">
            Registration for the {settings.edition} edition is closed. Contact the organising team if
            you need a late entry.
          </Notice>
        </div>
      ) : (
        <p className="mt-4 text-xs text-ink-muted">
          Entries close <strong className="text-ink-soft">{fmtDate(settings.registrationClosesAt)}</strong>.
          Entry fee is ₹{settings.feePerParticipant} per participant.
        </p>
      )}

      <div className="mt-8">
        <RegisterSchoolForm disabled={settings.registrationLocked} />
      </div>

      <p className="mt-6 text-sm text-ink-soft">
        Already registered?{' '}
        <Link href="/login" className="font-medium text-tkd-red hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
