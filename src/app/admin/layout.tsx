import { requireAdmin } from '@/lib/auth';
import { db, getSettings } from '@/lib/db';
import { AppShell, type NavSection } from '@/components/AppShell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [session, settings] = await Promise.all([requireAdmin(), getSettings()]);

  const [pendingSchools, disputes] = await Promise.all([
    db.school.count({ where: { status: 'PENDING', submittedAt: { not: null } } }),
    db.bout.count({ where: { disputeFlag: true } }),
  ]);

  const sections: NavSection[] = [
    { items: [{ href: '/admin', label: 'Dashboard', exact: true }] },
    {
      title: 'Entries',
      items: [
        { href: '/admin/schools', label: 'Schools', badge: pendingSchools },
        { href: '/admin/participants', label: 'Participants' },
        { href: '/admin/accreditation', label: 'Accreditation' },
        { href: '/admin/checkin', label: 'Check-in & weigh-in' },
      ],
    },
    {
      title: 'Competition',
      items: [
        { href: '/admin/categories', label: 'Categories & divisions' },
        { href: '/admin/draws', label: 'Draws & brackets' },
        { href: '/admin/schedule', label: 'Schedule & mats' },
        { href: '/admin/live', label: 'Live control', badge: disputes },
      ],
    },
    {
      title: 'Output',
      items: [
        { href: '/admin/certificates', label: 'Certificates' },
        { href: '/admin/officials', label: 'Referees & jury' },
        { href: '/admin/mats', label: 'Mats' },
      ],
    },
    {
      title: 'Setup',
      items: [
        { href: '/admin/settings', label: 'Event settings' },
        { href: '/admin/audit', label: 'Audit trail' },
      ],
    },
  ];

  return (
    <AppShell
      eventName={settings.eventName}
      edition={settings.edition}
      role="SUPER_ADMIN"
      userName={session.name}
      contextLine="Host / Super Admin"
      sections={sections}
    >
      {children}
    </AppShell>
  );
}
