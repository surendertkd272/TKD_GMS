import { requireSchool } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { ProfileForm } from './ProfileForm';

export const metadata = { title: 'Institution details' };
export const dynamic = 'force-dynamic';

export default async function SchoolProfilePage() {
  const { school } = await requireSchool();

  return (
    <>
      <PageHeader
        title="Institution details"
        subtitle="Entered once and reused on every participant, accreditation card and certificate for this school."
      />
      <ProfileForm
        values={{
          name: school.name,
          boardAffiliation: school.boardAffiliation ?? '',
          address: school.address ?? '',
          city: school.city ?? '',
          state: school.state ?? '',
          principalName: school.principalName ?? '',
          coachName: school.coachName ?? '',
          coachPhone: school.coachPhone ?? '',
          contactEmail: school.contactEmail,
          contactPhone: school.contactPhone ?? '',
          code: school.code,
        }}
      />
    </>
  );
}
