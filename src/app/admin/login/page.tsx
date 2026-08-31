import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser, homeFor } from '@/lib/auth';
import { AdminLoginForm } from './AdminLoginForm';

const ERRORS: Record<string, string> = {
  disabled: 'That account has been disabled.',
};

export const metadata = { title: 'Organiser sign in' };

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await currentUser();
  if (session) redirect(homeFor(session));

  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen flex-col justify-center bg-surface-sunk px-4 py-12">
      <div className="mx-auto w-full max-w-md">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-tkd-red text-[13px] font-bold tracking-tight text-white"
            aria-hidden
          >
            태
          </span>
          <span>
            <span className="block text-[13px] font-semibold leading-tight tracking-tight text-ink">
              Taekwondo GMS
            </span>
            <span className="block text-[11px] leading-tight text-ink-muted">Game Management System</span>
          </span>
        </Link>

        <div className="card mt-6 p-6">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Organiser sign in</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            For the organising team. Schools and mat officials sign in from their own event page.
          </p>

          <div className="mt-8">
            <AdminLoginForm initialError={error ? ERRORS[error] : undefined} />
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-ink-muted">
          <Link href="/" className="hover:text-tkd-red">
            ← All events
          </Link>
        </p>
      </div>
    </div>
  );
}
