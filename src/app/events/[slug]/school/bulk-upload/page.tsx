import { requireSchool } from '@/lib/auth';

import { Card, Notice, PageHeader } from '@/components/ui';
import { CSV_TEMPLATE_HEADERS } from '@/lib/school-service';
import { BulkUploadForm } from './BulkUploadForm';

export const metadata = { title: 'Bulk CSV upload' };
export const dynamic = 'force-dynamic';

const COLUMN_NOTES: Record<string, string> = {
  name: 'Required. Full name as it should print on the card and certificate.',
  gender: 'Required. M / F (also accepts Male, Female, Boy, Girl).',
  dob: 'Required. dd/mm/yyyy, dd-mm-yyyy or yyyy-mm-dd.',
  weight_kg: 'Required. Number in kilograms — an estimate is fine.',
  belt_grade: 'Required. White, Yellow, Green, Blue, Red, Black 1st Dan…',
  events: 'Required for athletes. Kyorugi, Poomsae, or Both.',
  role: 'Optional. Athlete (default), Coach, Official, Volunteer.',
  email: 'Optional.',
  phone: 'Optional.',
  emergency_contact_name: 'Optional but strongly recommended.',
  emergency_contact_phone: 'Optional but strongly recommended.',
  medical_notes: 'Optional. Seen by organisers and mat officials only.',
};

export default async function BulkUploadPage() {
  const { school, event } = await requireSchool();

  return (
    <>
      <PageHeader
        title="Bulk CSV upload"
        subtitle={`Upload the whole squad for ${school.name} in one go. Every row is validated before anything is saved, and the age category is calculated for you.`}
        actions={
          <a href="/api/csv-template" className="btn-ghost" download>
            Download CSV template
          </a>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {event.registrationLocked ? (
            <Notice kind="warn">Registration is closed — bulk upload is disabled.</Notice>
          ) : (
            <BulkUploadForm eventSlug={event.slug} />
          )}
        </div>

        <Card title="Column reference" bodyClassName="card-pad">
          <dl className="space-y-3.5">
            {CSV_TEMPLATE_HEADERS.map((header) => (
              <div key={header}>
                <dt className="num text-xs font-semibold text-ink">{header}</dt>
                <dd className="mt-0.5 text-xs leading-relaxed text-ink-muted">{COLUMN_NOTES[header]}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-5 border-t border-surface-line pt-4">
            <p className="text-xs leading-relaxed text-ink-muted">
              Photos cannot come through a CSV. Upload them per participant afterwards — the
              accreditation card prints an empty photo box without one.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
