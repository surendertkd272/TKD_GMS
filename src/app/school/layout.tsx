import { requireSchool } from '@/lib/auth';
import { getSettings, db } from '@/lib/db';
import { AppShell, type NavSection } from '@/components/AppShell';

export default async function SchoolLayout({ children }: { children: React.ReactNode }) {
  const [{ session, school }, settings] = await Promise.all([requireSchool(), getSettings()]);

  const [participantCount, certificateCount] = await Promise.all([
    db.participant.count({ where: { schoolId: school.id } }),
    db.certificate.count({ where: { participant: { schoolId: school.id }, revoked: false } }),
  ]);

  const sections: NavSection[] = [
    {
      items: [
        { href: '/school', label: 'Overview', exact: true },
        { href: '/school/profile', label: 'Institution details' },
      ],
    },
    {
      title: 'Entries',
      items: [
        { href: '/school/participants', label: 'Participants', badge: participantCount },
        { href: '/school/bulk-upload', label: 'Bulk CSV upload' },
        { href: '/school/payment', label: 'Entry fee' },
      ],
    },
    {
      title: 'Event',
      items: [
        { href: '/school/accreditation', label: 'Accreditation cards' },
        { href: '/school/draws', label: 'Draws & schedule' },
        { href: '/school/results', label: 'Our results' },
        { href: '/school/certificates', label: 'Certificates', badge: certificateCount },
      ],
    },
  ];

  return (
    <AppShell
      eventName={settings.eventName}
      edition={settings.edition}
      role="SCHOOL"
      userName={session.name}
      contextLine={`${school.name} · ${school.code}`}
      sections={sections}
    >
      {children}
    </AppShell>
  );
}
