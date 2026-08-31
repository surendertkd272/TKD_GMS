import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LoginForm } from './LoginForm';
import { currentUser, homeFor } from '@/lib/auth';

const ERRORS: Record<string, string> = {
  disabled: 'That account has been disabled. Contact the organising team.',
  'no-school': 'Your login is not linked to a school. Contact the organising team.',
};

export const metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await currentUser();
  if (session) redirect(homeFor(session.role));

  const { error } = await searchParams;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Sign in</h1>
      <p className="mt-1.5 text-sm text-ink-soft">
        For schools, the organising team and mat officials.
      </p>

      <div className="mt-8">
        <LoginForm initialError={error ? ERRORS[error] : undefined} />
      </div>

      <p className="mt-6 text-sm text-ink-soft">
        Registering a school for the first time?{' '}
        <Link href="/register-school" className="font-medium text-tkd-red hover:underline">
          Create a school account
        </Link>
      </p>

      <div className="mt-10 rounded-lg border border-surface-line bg-surface-sunk/60 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          Demo logins (seeded)
        </p>
        <ul className="mt-2 space-y-1 font-mono text-xs text-ink-soft">
          <li>admin@taekwondogms.org · Admin@123</li>
          <li>coach@demotkd.edu.in · School@123</li>
          <li>referee1@taekwondogms.org · Referee@123</li>
        </ul>
      </div>
    </div>
  );
}
