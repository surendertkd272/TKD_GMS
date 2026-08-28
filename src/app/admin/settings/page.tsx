import { requireAdmin } from '@/lib/auth';
import { getSettings } from '@/lib/db';
import { PageHeader } from '@/components/ui';
import { toDateInput, toDateTimeInput } from '@/lib/format';
import { SettingsForm } from './SettingsForm';

export const metadata = { title: 'Event settings' };
export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  await requireAdmin();
  const settings = await getSettings();

  return (
    <>
      <PageHeader
        title="Event settings"
        subtitle="Everything the system prints, calculates or publishes comes from here — so a future edition is a settings change, not a rebuild."
      />
      <SettingsForm
        values={{
          eventName: settings.eventName,
          edition: settings.edition,
          organiser: settings.organiser,
          venue: settings.venue,
          startDate: toDateTimeInput(settings.startDate),
          endDate: toDateTimeInput(settings.endDate),
          registrationOpensAt: toDateTimeInput(settings.registrationOpensAt),
          registrationClosesAt: toDateTimeInput(settings.registrationClosesAt),
          ageReferenceDate: toDateInput(settings.ageReferenceDate),
          feePerParticipant: settings.feePerParticipant,
          pointsGold: settings.pointsGold,
          pointsSilver: settings.pointsSilver,
          pointsBronze: settings.pointsBronze,
          signatory1Name: settings.signatory1Name,
          signatory1Title: settings.signatory1Title,
          signatory2Name: settings.signatory2Name,
          signatory2Title: settings.signatory2Title,
          registrationLocked: settings.registrationLocked,
          drawsPublished: settings.drawsPublished,
          resultsPublished: settings.resultsPublished,
        }}
      />
    </>
  );
}
