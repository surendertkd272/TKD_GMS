import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { isOnDefaultPassword } from '@/lib/account';
import { logoutAction } from '@/actions/auth';
import { Card, Notice, PageHeader } from '@/components/ui';
import { ADMIN_EVENTS } from '@/lib/paths';
import { ChangePasswordForm } from './ChangePasswordForm';

export const metadata = { title: 'Your account' };
export const dynamic = 'force-dynamic';

export default async function AdminAccountPage() {
  const session = await requireAdmin();
  const onDefault = await isOnDefaultPassword(session.userId);

  return (
    <div className="min-h-screen bg-surface-sunk">
      <header className="border-b border-surface-line bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link href={ADMIN_EVENTS} className="flex items-center gap-2.5">
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
              <span className="block text-[11px] leading-tight text-ink-muted">Organiser console</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href={ADMIN_EVENTS} className="btn-quiet btn-sm">
              Back to events
            </Link>
            <form action={logoutAction}>
              <button className="btn-quiet btn-sm" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <PageHeader title="Your account" subtitle={`Signed in as ${session.email}.`} />

        {onDefault && (
          <Notice kind="warn">
            This account is still on the password created by the seed script. Anyone who knows the
            default can sign in as the organiser — change it now.
          </Notice>
        )}

        <ChangePasswordForm />

        <Card bodyClassName="card-pad">
          <p className="text-sm text-ink-soft">
            Changing your password does not sign you out of this browser, and it does not affect any
            school or referee login — each of those is managed inside its own event.
          </p>
        </Card>
      </main>
    </div>
  );
}
