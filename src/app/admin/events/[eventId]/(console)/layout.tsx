import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { db, getEventById } from '@/lib/db';
import { AppShell, type NavSection } from '@/components/AppShell';
import { ADMIN_EVENTS, adminPath, eventPath } from '@/lib/paths';

export default async function AdminEventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const [session, event] = await Promise.all([requireAdmin(), getEventById(eventId)]);
  if (!event) notFound();

  const [pendingSchools, disputes] = await Promise.all([
    db.school.count({ where: { eventId, status: 'PENDING', submittedAt: { not: null } } }),
    db.bout.count({ where: { disputeFlag: true, category: { eventId } } }),
  ]);

  const sections: NavSection[] = [
    {
      items: [
        { href: ADMIN_EVENTS, label: '← All events', back: true },
        { href: adminPath(eventId), label: 'Dashboard', exact: true },
      ],
    },
    {
      title: 'Entries',
      items: [
        { href: adminPath(eventId, 'schools'), label: 'Schools', badge: pendingSchools },
        { href: adminPath(eventId, 'participants'), label: 'Participants' },
        { href: adminPath(eventId, 'accreditation'), label: 'Accreditation' },
        { href: adminPath(eventId, 'checkin'), label: 'Check-in & weigh-in' },
      ],
    },
    {
      title: 'Competition',
      items: [
        { href: adminPath(eventId, 'categories'), label: 'Categories & divisions' },
        { href: adminPath(eventId, 'draws'), label: 'Draws & brackets' },
        { href: adminPath(eventId, 'schedule'), label: 'Schedule & mats' },
        { href: adminPath(eventId, 'live'), label: 'Live control', badge: disputes },
      ],
    },
    {
      title: 'Output',
      items: [
        { href: adminPath(eventId, 'certificates'), label: 'Certificates' },
        { href: adminPath(eventId, 'outbox'), label: 'Outbox' },
        { href: adminPath(eventId, 'officials'), label: 'Referees & jury' },
        { href: adminPath(eventId, 'mats'), label: 'Mats' },
      ],
    },
    {
      title: 'Setup',
      items: [
        { href: adminPath(eventId, 'settings'), label: 'Event settings' },
        { href: adminPath(eventId, 'audit'), label: 'Audit trail' },
      ],
    },
  ];

  return (
    <AppShell
      eventName={event.eventName}
      edition={event.edition}
      homeHref={adminPath(eventId)}
      publicHref={eventPath(event.slug)}
      role="SUPER_ADMIN"
      userName={session.name}
      contextLine="Host / Super Admin"
      sections={sections}
    >
      {children}
    </AppShell>
  );
}
