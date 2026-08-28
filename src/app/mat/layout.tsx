import Link from 'next/link';
import { requireReferee } from '@/lib/auth';
import { getSettings } from '@/lib/db';
import { logoutAction } from '@/actions/auth';
import { Brand } from '@/components/Brand';
import { TopLink } from '@/components/NavLink';

/**
 * Deliberately not the sidebar shell used elsewhere: mat-side officials work on a
 * tablet in a hurry, so this is a single wide column with large touch targets.
 */
export default async function MatLayout({ children }: { children: React.ReactNode }) {
  const [{ session, user }, settings] = await Promise.all([requireReferee(), getSettings()]);

  return (
    <div className="min-h-screen bg-surface-sunk">
      <header className="sticky top-0 z-30 border-b border-surface-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Brand eventName={settings.eventName} edition={settings.edition} href="/mat" compact />

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight text-ink">{session.name}</p>
              <p className="text-xs leading-tight text-ink-muted">
                {user.assignedMat ? user.assignedMat.name : 'No mat assigned'}
                {user.isJury ? ' · jury' : ''}
              </p>
            </div>
            <span
              className={`badge ${user.assignedMat ? 'badge-green' : 'badge-amber'} hidden sm:inline-flex`}
            >
              {user.assignedMat?.name ?? 'Unassigned'}
            </span>
            <form action={logoutAction}>
              <button className="btn-ghost btn-sm" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>

        <nav className="mx-auto flex max-w-6xl gap-5 px-4 sm:px-6">
          <TopLink href="/mat" exact>
            Mat queue
          </TopLink>
          <TopLink href="/mat/poomsae">Poomsae judging</TopLink>
          <Link
            href="/results"
            target="_blank"
            className="py-3.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
          >
            Public results ↗
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
    </div>
  );
}
