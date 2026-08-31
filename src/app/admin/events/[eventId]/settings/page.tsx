import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { getEventById } from '@/lib/db';
import { PageHeader } from '@/components/ui';
import { toDateInput, toDateTimeInput } from '@/lib/format';
import { SettingsForm } from './SettingsForm';

export const metadata = { title: 'Event settings' };
export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage({ params }: { params: Promise<{ eventId: string }> }) {
  await requireAdmin();
  const { eventId } = await params;
  const event = await getEventById(eventId);
  if (!event) notFound();

  return (
    <>
      <PageHeader
        title="Event settings"
        subtitle="Everything the system prints, calculates or publishes comes from here — so a future edition is a settings change, not a rebuild."
      />
      <SettingsForm
        values={{
          eventName: event.eventName,
          edition: event.edition,
          organiser: event.organiser,
          venue: event.venue,
          startDate: toDateTimeInput(event.startDate),
          endDate: toDateTimeInput(event.endDate),
          registrationOpensAt: toDateTimeInput(event.registrationOpensAt),
          registrationClosesAt: toDateTimeInput(event.registrationClosesAt),
          ageReferenceDate: toDateInput(event.ageReferenceDate),
          feePerParticipant: event.feePerParticipant,
          pointsGold: event.pointsGold,
          pointsSilver: event.pointsSilver,
          pointsBronze: event.pointsBronze,
          signatory1Name: event.signatory1Name,
          signatory1Title: event.signatory1Title,
          signatory2Name: event.signatory2Name,
          signatory2Title: event.signatory2Title,
          registrationLocked: event.registrationLocked,
          drawsPublished: event.drawsPublished,
          resultsPublished: event.resultsPublished,
        }}
      />
    </>
  );
}
