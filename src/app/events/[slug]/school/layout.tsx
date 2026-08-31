import { redirect } from 'next/navigation';
import { requireSchool } from '@/lib/auth';
import { db } from '@/lib/db';
import { AppShell, type NavSection } from '@/components/AppShell';
import { schoolPath } from '@/lib/paths';

export default async function SchoolLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { session, school, event } = await requireSchool();

  // The event comes from the school's own row — if the URL names a different
  // event, send them to their own rather than serving another event's data.
  if (event.slug !== slug) redirect(schoolPath(event.slug));

  const [participantCount, certificateCount] = await Promise.all([
    db.participant.count({ where: { schoolId: school.id } }),
    db.certificate.count({ where: { participant: { schoolId: school.id }, revoked: false } }),
  ]);

  const sections: NavSection[] = [
    {
      items: [
        { href: schoolPath(event.slug), label: 'Overview', exact: true },
        { href: schoolPath(event.slug, 'profile'), label: 'Institution details' },
      ],
    },
    {
      title: 'Entries',
      items: [
        { href: schoolPath(event.slug, 'participants'), label: 'Participants', badge: participantCount },
        { href: schoolPath(event.slug, 'bulk-upload'), label: 'Bulk CSV upload' },
        { href: schoolPath(event.slug, 'payment'), label: 'Entry fee' },
      ],
    },
    {
      title: 'Competition',
      items: [
        { href: schoolPath(event.slug, 'accreditation'), label: 'Accreditation cards' },
        { href: schoolPath(event.slug, 'draws'), label: 'Draws & schedule' },
        { href: schoolPath(event.slug, 'results'), label: 'Our results' },
        { href: schoolPath(event.slug, 'certificates'), label: 'Certificates', badge: certificateCount },
      ],
    },
  ];

  return (
    <AppShell
      eventName={event.eventName}
      edition={event.edition}
      eventSlug={slug}
      role="SCHOOL"
      userName={session.name}
      contextLine={`${school.name} · ${school.code}`}
      sections={sections}
    >
      {children}
    </AppShell>
  );
}
