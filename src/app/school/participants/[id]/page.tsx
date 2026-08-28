import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSchool } from '@/lib/auth';
import { db, getSettings } from '@/lib/db';
import { deleteParticipant } from '@/actions/school';
import { Card, KeyValue, Notice, PageHeader, StatusBadge } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { fmtDate, fmtDateTime, toDateInput } from '@/lib/format';
import { ParticipantForm } from '../ParticipantForm';

export const dynamic = 'force-dynamic';

export default async function EditParticipantPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ school }, settings, { id }] = await Promise.all([requireSchool(), getSettings(), params]);

  const participant = await db.participant.findFirst({
    where: { id, schoolId: school.id },
    include: {
      entries: {
        include: {
          category: true,
          result: true,
          redBouts: { include: { category: true, mat: true } },
          blueBouts: { include: { category: true, mat: true } },
        },
      },
      certificates: { where: { revoked: false }, include: { category: true } },
    },
  });
  if (!participant) notFound();

  const inLiveDraw = participant.entries.some(
    (e) => e.category.drawStatus === 'PUBLISHED' || e.category.drawStatus === 'LOCKED',
  );

  return (
    <>
      <PageHeader
        title={participant.name}
        subtitle={
          <>
            <span className="num">{participant.code}</span> · <StatusBadge status={participant.status} /> ·
            accreditation revision {participant.accreditationVersion}
          </>
        }
        actions={
          <>
            <Link href={`/api/accreditation/participant/${participant.id}`} className="btn-ghost" target="_blank">
              Download card
            </Link>
            <Link href="/school/participants" className="btn-quiet">
              Back to list
            </Link>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {settings.registrationLocked && (
            <Notice kind="warn">
              Registration is closed — details are read-only. Contact the organising team for a
              correction.
            </Notice>
          )}
          {inLiveDraw && !settings.registrationLocked && (
            <Notice kind="info">
              This athlete is in a published draw. Weight or date-of-birth edits will not move them
              between divisions — a Super Admin has to do that so the bracket stays valid.
            </Notice>
          )}

          <ParticipantForm
            mode="edit"
            readOnly={settings.registrationLocked}
            ageReferenceIso={settings.ageReferenceDate.toISOString()}
            ageReferenceLabel={fmtDate(settings.ageReferenceDate)}
            values={{
              id: participant.id,
              code: participant.code,
              name: participant.name,
              gender: participant.gender,
              dob: toDateInput(participant.dob),
              weightKg: String(participant.weightKg),
              beltGrade: participant.beltGrade,
              personRole: participant.personRole,
              email: participant.email ?? '',
              phone: participant.phone ?? '',
              emergencyContactName: participant.emergencyContactName ?? '',
              emergencyContactPhone: participant.emergencyContactPhone ?? '',
              medicalNotes: participant.medicalNotes ?? '',
              events: [...new Set(participant.entries.map((e) => e.category.event))],
              photoPath: participant.photoPath,
            }}
          />
        </div>

        <div className="space-y-6">
          <Card title="Record" bodyClassName="card-pad">
            <KeyValue
              rows={[
                ['Entered', fmtDateTime(participant.createdAt)]  ,
                ['Last updated', fmtDateTime(participant.updatedAt)],
                ['Weigh-in', participant.weighInAt ? `${participant.weighInWeight} kg · ${fmtDateTime(participant.weighInAt)}` : 'Not weighed in'],
                ['Venue check-in', participant.checkedInAt ? fmtDateTime(participant.checkedInAt) : 'Not checked in'],
              ]}
            />
          </Card>

          {participant.entries.length > 0 && (
            <Card title="Divisions & draw" bodyClassName="card-pad">
              <ul className="space-y-4">
                {participant.entries.map((entry) => {
                  const bouts = [...entry.redBouts, ...entry.blueBouts];
                  return (
                    <li key={entry.id} className="border-b border-surface-line pb-4 last:border-b-0 last:pb-0">
                      <p className="text-sm font-medium text-ink">{entry.category.name}</p>
                      <p className="mt-0.5 flex items-center gap-2 text-xs text-ink-muted">
                        <StatusBadge status={entry.category.drawStatus} />
                        {entry.seed ? <span>Seed {entry.seed}</span> : null}
                        {entry.result?.medal ? <StatusBadge status={entry.result.medal} /> : null}
                      </p>
                      {bouts.length > 0 && (
                        <p className="mt-1.5 text-xs text-ink-soft">
                          {bouts.length} bout{bouts.length === 1 ? '' : 's'} in the bracket
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {participant.certificates.length > 0 && (
            <Card title="Certificates" bodyClassName="card-pad">
              <ul className="space-y-2.5">
                {participant.certificates.map((cert) => (
                  <li key={cert.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate text-ink">{cert.type === 'WINNER' ? 'Merit' : 'Participation'}</span>
                      <span className="num block text-xs text-ink-muted">{cert.certNo}</span>
                    </span>
                    <Link href={`/api/certificates/${cert.id}`} className="btn-ghost btn-sm" target="_blank">
                      PDF
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {!settings.registrationLocked && (
            <Card title="Remove participant" bodyClassName="card-pad">
              <p className="mb-3 text-sm leading-relaxed text-ink-soft">
                {inLiveDraw
                  ? 'This athlete is in a published draw, so removal records a withdrawal and the bracket advances their opponent.'
                  : 'This permanently deletes the entry and its photo.'}
              </p>
              <form action={deleteParticipant}>
                <input type="hidden" name="participantId" value={participant.id} />
                <SubmitButton
                  className="btn-danger w-full"
                  pendingLabel="Removing…"
                  confirm={
                    inLiveDraw
                      ? `Withdraw ${participant.name} from the championship?`
                      : `Permanently delete ${participant.name}?`
                  }
                >
                  {inLiveDraw ? 'Withdraw athlete' : 'Delete participant'}
                </SubmitButton>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
