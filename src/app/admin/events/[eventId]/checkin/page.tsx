import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { db, getEventById } from '@/lib/db';
import { Card, Empty, KeyValue, Notice, PageHeader, StatusBadge } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
import { AGE_CATEGORY_SHORT, type AgeCategory } from '@/lib/constants';
import { CheckInScanner } from './CheckInScanner';
import { CheckInActions } from './CheckInActions';

export const metadata = { title: 'Check-in & weigh-in' };
export const dynamic = 'force-dynamic';

export default async function AdminCheckInPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ code?: string }>;
}) {
  await requireAdmin();
  const [{ eventId }, params] = await Promise.all([routeParams, searchParams]);
  const event = await getEventById(eventId);
  if (!event) notFound();
  const code = params.code?.trim().toUpperCase();

  const participant = code
    ? await db.participant.findFirst({
        where: { school: { eventId }, code },
        include: {
          school: { select: { code: true, name: true, status: true } },
          entries: { include: { category: { select: { name: true, discipline: true } } } },
        },
      })
    : null;

  const [checkedInCount, approvedCount] = await Promise.all([
    db.participant.count({ where: { school: { eventId }, status: 'APPROVED', checkedInAt: { not: null } } }),
    db.participant.count({ where: { school: { eventId }, status: 'APPROVED' } }),
  ]);

  return (
    <>
      <PageHeader
        title="Check-in & weigh-in"
        subtitle={`Scan or enter a participant's card to mark venue check-in and record their weigh-in. ${checkedInCount} of ${approvedCount} approved participants checked in so far.`}
      />

      <div className="space-y-5">
        <Card title="Find a participant" bodyClassName="card-pad">
          <CheckInScanner initialCode={code} />
        </Card>

        {code && !participant && (
          <Notice kind="error">No participant found for &ldquo;{code}&rdquo;. Check the code and try again.</Notice>
        )}

        {participant && (
          <Card
            title={participant.name}
            subtitle={`${participant.code} · ${participant.school.code} — ${participant.school.name}`}
            actions={<StatusBadge status={participant.status} />}
          >
            <div className="space-y-5">
              <KeyValue
                rows={[
                  ['Category', `${AGE_CATEGORY_SHORT[participant.ageCategory as AgeCategory] ?? participant.ageCategory} · ${participant.gender === 'MALE' ? 'M' : 'F'}`],
                  ['Belt grade', participant.beltGrade],
                  ['Phone', participant.phone || 'Not on file'],
                  ['Declared weight', `${participant.weightKg} kg`],
                  ['Divisions', participant.entries.map((e) => e.category.name).join(', ') || '—'],
                  ['Checked in', participant.checkedInAt ? fmtDateTime(participant.checkedInAt) : 'Not yet'],
                  [
                    'Weigh-in',
                    participant.weighInAt
                      ? `${participant.weighInWeight} kg · ${fmtDateTime(participant.weighInAt)}`
                      : 'Not yet',
                  ],
                ]}
              />

              <CheckInActions
                code={participant.code}
                alreadyCheckedIn={Boolean(participant.checkedInAt)}
                declaredWeight={participant.weightKg}
                phone={participant.phone}
              />
            </div>
          </Card>
        )}

        {!code && (
          <Empty
            title="Scan a card or type a participant ID"
            hint="This gate is for the day of the event — it marks a participant as physically present and records their weigh-in weight against their declared weight."
          />
        )}
      </div>
    </>
  );
}
