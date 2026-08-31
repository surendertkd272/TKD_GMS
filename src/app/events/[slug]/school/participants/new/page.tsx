import { requireSchool } from '@/lib/auth';

import { PageHeader, Notice } from '@/components/ui';
import { fmtDate, toDateInput } from '@/lib/format';
import { ParticipantForm } from '../ParticipantForm';

export const metadata = { title: 'Add participant' };

export default async function NewParticipantPage() {
  const { school, event } = await requireSchool();

  return (
    <>
      <PageHeader
        title="Add participant"
        subtitle={`Entering for ${school.name}. Institution details are already on file and are not re-keyed.`}
      />

      {event.registrationLocked ? (
        <Notice kind="warn">
          Registration is closed for this edition — new entries cannot be added. Contact the organising
          team for a late entry.
        </Notice>
      ) : (
        <ParticipantForm
          eventSlug={event.slug}
          mode="create"
          ageReferenceIso={event.ageReferenceDate.toISOString()}
          ageReferenceLabel={fmtDate(event.ageReferenceDate)}
        />
      )}
    </>
  );
}

export const dynamic = 'force-dynamic';
