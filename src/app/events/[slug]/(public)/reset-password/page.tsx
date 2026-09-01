import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getEventBySlug } from '@/lib/db';
import { Notice } from '@/components/ui';
import { eventLoginPath } from '@/lib/paths';
import { ResetPasswordForm } from './ResetPasswordForm';

export const metadata = { title: 'Set a new password' };

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ slug }, { token }] = await Promise.all([params, searchParams]);
  const event = await getEventBySlug(slug);
  if (!event) notFound();

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Set a new password</h1>
      <p className="mt-1.5 text-sm text-ink-soft">For your {event.eventName} account.</p>

      <div className="mt-8">
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <Notice kind="error">
            This link is missing its token. Open the link from the email exactly as it was sent, or{' '}
            <Link href={`${eventLoginPath(slug).replace('/login', '')}/forgot-password`} className="font-medium underline">
              request a new one
            </Link>
            .
          </Notice>
        )}
      </div>
    </div>
  );
}
