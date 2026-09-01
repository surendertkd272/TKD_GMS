import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getEventBySlug } from '@/lib/db';
import { eventLoginPath } from '@/lib/paths';
import { ForgotPasswordForm } from './ForgotPasswordForm';

export const metadata = { title: 'Forgot your password' };

export default async function ForgotPasswordPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) notFound();

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Forgot your password</h1>
      <p className="mt-1.5 text-sm text-ink-soft">
        Enter the email you sign in with for {event.eventName}. We will send a link that lets you set
        a new password.
      </p>

      <div className="mt-8">
        <ForgotPasswordForm eventId={event.id} />
      </div>

      <p className="mt-6 text-sm text-ink-soft">
        Remembered it?{' '}
        <Link href={eventLoginPath(slug)} className="font-medium text-tkd-red hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
