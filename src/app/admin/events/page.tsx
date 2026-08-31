import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { logoutAction } from '@/actions/auth';
import { toggleEventListing } from '@/actions/events';
import { Card, Empty, PageHeader, StatusBadge, TableWrap } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { fmtDate } from '@/lib/format';
import { ADMIN_EVENT_NEW, adminPath, eventPath } from '@/lib/paths';

export const metadata = { title: 'Events' };
export const dynamic = 'force-dynamic';

export default async function AdminEventsPage() {
  const session = await requireAdmin();

  const events = await db.event.findMany({
    orderBy: { startDate: 'desc' },
    include: {
      _count: { select: { schools: true, categories: true } },
    },
  });

  return (
    <div className="min-h-screen bg-surface-sunk">
      <header className="border-b border-surface-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
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
              <span className="block text-[11px] leading-tight text-ink-muted">Organiser console</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-ink-muted sm:inline">{session.name}</span>
            <form action={logoutAction}>
              <button className="btn-quiet btn-sm" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <PageHeader
          title="Events"
          subtitle="Each event is a self-contained championship — its own schools, divisions, draws and results."
          actions={
            <Link href={ADMIN_EVENT_NEW} className="btn-primary">
              Create event
            </Link>
          }
        />

        {events.length === 0 ? (
          <Empty
            title="No events yet"
            hint="Create your first championship — divisions, mats and the school registration link all follow from it."
            action={
              <Link href={ADMIN_EVENT_NEW} className="btn-primary btn-sm">
                Create event
              </Link>
            }
          />
        ) : (
          <Card bodyClassName="">
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Dates</th>
                    <th>Schools</th>
                    <th>Divisions</th>
                    <th>Listed publicly</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id}>
                      <td>
                        <Link href={adminPath(event.id)} className="font-medium text-ink hover:text-tkd-red">
                          {event.eventName}
                        </Link>
                        <span className="block text-xs text-ink-muted">
                          {event.edition} · <span className="num">{event.shortCode}</span> · /{event.slug}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-xs">
                        {fmtDate(event.startDate)} – {fmtDate(event.endDate)}
                      </td>
                      <td className="num">{event._count.schools}</td>
                      <td className="num">{event._count.categories}</td>
                      <td>
                        <form action={toggleEventListing} className="flex items-center gap-2">
                          <input type="hidden" name="eventId" value={event.id} />
                          <StatusBadge
                            status={event.isPublic ? 'PUBLISHED' : 'DRAFT'}
                            label={event.isPublic ? 'Listed' : 'Unlisted'}
                          />
                          <SubmitButton className="btn-quiet btn-sm" pendingLabel="…">
                            {event.isPublic ? 'Unlist' : 'List'}
                          </SubmitButton>
                        </form>
                      </td>
                      <td className="whitespace-nowrap text-right">
                        <Link href={eventPath(event.slug)} className="btn-quiet btn-sm" target="_blank">
                          Public
                        </Link>
                        <Link href={adminPath(event.id)} className="btn-ghost btn-sm ml-2">
                          Manage
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        )}
      </main>
    </div>
  );
}
