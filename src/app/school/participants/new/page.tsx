import { requireSchool } from '@/lib/auth';
import { getSettings } from '@/lib/db';
import { PageHeader, Notice } from '@/components/ui';
import { fmtDate, toDateInput } from '@/lib/format';
import { ParticipantForm } from '../ParticipantForm';

export const metadata = { title: 'Add participant' };

export default async function NewParticipantPage() {
  const [{ school }, settings] = await Promise.all([requireSchool(), getSettings()]);

  return (
    <>
      <PageHeader
        title="Add participant"
        subtitle={`Entering for ${school.name}. Institution details are already on file and are not re-keyed.`}
      />

      {settings.registrationLocked ? (
        <Notice kind="warn">
          Registration is closed for this edition — new entries cannot be added. Contact the organising
          team for a late entry.
        </Notice>
      ) : (
        <ParticipantForm
          mode="create"
          ageReferenceIso={settings.ageReferenceDate.toISOString()}
          ageReferenceLabel={fmtDate(settings.ageReferenceDate)}
        />
      )}
    </>
  );
}

export const dynamic = 'force-dynamic';
